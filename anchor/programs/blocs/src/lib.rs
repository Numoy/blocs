use anchor_lang::prelude::*;

declare_id!("C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM");

#[program]
pub mod blocs {
    use super::*;
    use anchor_lang::Discriminator;

    // Initialize the grid (Run once by admin)
    // Note: Account must be created by client with 3.32MB space and owned by program.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let grid_acc = &ctx.accounts.grid;
        
        // 1. Verify owner is program
        require!(grid_acc.owner == ctx.program_id, CustomError::Unauthorized); // Use a generic error or new one

        // 2. Write Discriminator manually
        let mut data = grid_acc.try_borrow_mut_data()?;
        let discriminator = GridState::discriminator();
        data[0..8].copy_from_slice(&discriminator);
        
        // 3. Set Admin
        // We can't use 'load_init' or 'load_mut' because it's Unchecked.
        // We use standard pointer arithmetic or bytemuck if possible, 
        // but 'blocks' is huge. Admin is at offset 8.
        let admin_key = ctx.accounts.admin.key();
        let admin_bytes = admin_key.to_bytes();
        data[8..40].copy_from_slice(&admin_bytes);
        
        // Remainder should be zeroed by system program upon creation.
        // grid.blocks is 0.

        Ok(())
    }

    pub fn buy_block(ctx: Context<BuyBlock>, id: u32, color: [u8; 3]) -> Result<()> {
        let grid = &mut ctx.accounts.grid.load_mut()?;
        let buyer = &ctx.accounts.buyer;
        let recipient = &ctx.accounts.payment_recipient;
        let admin = &ctx.accounts.admin;
        
        // Define Admin (Creator) Key
        let admin_key = grid.admin;
        
        // Validation: Ensure the passed 'admin' account matches the grid's admin
        require!(admin.key() == admin_key, CustomError::InvalidAdmin);

        let id_usize = id as usize;
        require!(id_usize < 10000, CustomError::InvalidBlockId);

        let block = &mut grid.blocks[id_usize];

        // 1. Determine Price and Recipient
        let (price, expected_recipient) = if block.owner == Pubkey::default() {
            // New Block -> Buy from Admin
            // Price: 0.05 SOL
            (50_000_000, admin_key) // 0.05 SOL
        } else {
            // Resale -> Buy from Current Owner
            require!(block.is_for_sale == 1, CustomError::NotForSale);
            (block.price, block.owner)
        };

        // 2. Validation
        require!(recipient.key() == expected_recipient, CustomError::InvalidRecipient);
        
        // 3. Transfer SOL with Fee Split
        if expected_recipient == admin_key {
            // Primary Sale (100% to Admin)
             let cpi_context = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: buyer.to_account_info(),
                    to: admin.to_account_info(),
                },
            );
            anchor_lang::system_program::transfer(cpi_context, price)?;
        } else {
            // Secondary Sale (95% to Seller, 5% to Admin)
            let fee = price * 5 / 100;
            let seller_amount = price - fee;
            
            // Transfer 95% to Seller
            let cpi_ctx_seller = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: buyer.to_account_info(),
                    to: recipient.to_account_info(),
                },
            );
            anchor_lang::system_program::transfer(cpi_ctx_seller, seller_amount)?;

            // Transfer 5% to Admin
            let cpi_ctx_admin = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: buyer.to_account_info(),
                    to: admin.to_account_info(),
                },
            );
            anchor_lang::system_program::transfer(cpi_ctx_admin, fee)?;
        }
        
        // 4. Update State
        block.owner = buyer.key();
        block.color = color;
        block.is_for_sale = 0; // False
        block.price = 0; // Reset
        
        // Reset content
        block.text = [0; 64]; 
        block.image_url = [0; 128];
        block.url = [0; 128];

        Ok(())
    }

    pub fn update_block(ctx: Context<UpdateBlock>, id: u32, text: String, image_url: String, url: String) -> Result<()> {
        let grid = &mut ctx.accounts.grid.load_mut()?;
        let id_usize = id as usize;
        require!(id_usize < 10000, CustomError::InvalidBlockId);

        let block = &mut grid.blocks[id_usize];
        require!(block.owner == ctx.accounts.signer.key(), CustomError::Unauthorized);

        // Copy strings to fixed-size arrays
        // Note: This truncates if too long, frontend should validate.
        copy_string_to_array(&text, &mut block.text);
        copy_string_to_array(&image_url, &mut block.image_url);
        copy_string_to_array(&url, &mut block.url);

        Ok(())
    }

    pub fn sell_block(ctx: Context<UpdateBlock>, id: u32, price: u64) -> Result<()> {
        let grid = &mut ctx.accounts.grid.load_mut()?;
        let id_usize = id as usize;
        require!(id_usize < 10000, CustomError::InvalidBlockId);

        let block = &mut grid.blocks[id_usize];
        require!(block.owner == ctx.accounts.signer.key(), CustomError::Unauthorized);

        if price > 0 {
            block.is_for_sale = 1; // True
            block.price = price;
        } else {
            block.is_for_sale = 0; // False (Delist)
            block.price = 0;
        }
        Ok(())
    }
}

// --------------------------------------------------------
// DATA STRUCTURES (Zero Copy for Performance)
// --------------------------------------------------------

#[account(zero_copy)]
pub struct GridState {
    pub admin: Pubkey,
    pub blocks: [BlockInfo; 10000], // Increased to 10,000 (100x100)
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
#[repr(C)]
pub struct BlockInfo {
    pub owner: Pubkey,       // 32
    pub price: u64,          // 8
    pub is_for_sale: u8,     // 1
    pub color: [u8; 3],      // 3
    pub padding: [u8; 4],    // 4
    
    // Content (Fixed Size Arrays)
    pub text: [u8; 64],      // 64
    pub image_url: [u8; 128], // 128
    pub url: [u8; 128],      // 128
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// CHECK: We are manually initializing this account because it is too large (>10KB) for CPI.
    /// We will write the discriminator and admin key manually.
    #[account(mut)]
    pub grid: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyBlock<'info> {
    #[account(mut)]
    pub grid: AccountLoader<'info, GridState>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: We verify this account matches the block owner or admin inside the instruction logic
    #[account(mut)]
    pub payment_recipient: SystemAccount<'info>,

    /// CHECK: Verified to match grid.admin
    #[account(mut)]
    pub admin: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: u32)]
pub struct UpdateBlock<'info> {
    #[account(mut)]
    pub grid: AccountLoader<'info, GridState>,
    #[account(address = grid.load()?.blocks[id as usize].owner)] // Verify signer is owner
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(id: u32)]
pub struct SellBlock<'info> {
    #[account(mut)]
    pub grid: AccountLoader<'info, GridState>,
    #[account(address = grid.load()?.blocks[id as usize].owner)] // Verify signer is owner
    pub signer: Signer<'info>,
}

#[error_code]
pub enum CustomError {
    #[msg("You are not the owner of this block.")]
    Unauthorized,
    #[msg("This block is not for sale.")]
    NotForSale,
    #[msg("Invalid Block ID.")]
    InvalidBlockId,
    #[msg("Invalid Payment Recipient.")]
    InvalidRecipient,
    #[msg("Invalid Admin Account.")]
    InvalidAdmin,
}

// Helper
fn copy_string_to_array(s: &str, arr: &mut [u8]) {
    let bytes = s.as_bytes();
    let len = bytes.len().min(arr.len());
    arr[..len].copy_from_slice(&bytes[..len]);
    // Zero out the rest
    for i in len..arr.len() {
        arr[i] = 0;
    }
}
