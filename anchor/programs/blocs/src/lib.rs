use anchor_lang::prelude::*;

declare_id!("C4MgCjSCzHPnxaFHqTPFH7ur67rKHeunEQAzGRSMDKDM");

#[program]
pub mod blocs {
    use super::*;

    pub const GRID_SIZE: usize = 10_000;
    pub const INITIAL_PRICE: u64 = 10_000_000; // 0.01 SOL
    pub const FEE_BASIS_POINTS: u64 = 500; // 5%

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let grid = &mut ctx.accounts.grid;
        require_eq!(grid.admin, Pubkey::default(), CustomError::AlreadyInitialized);
        grid.admin = ctx.accounts.admin.key();
        Ok(())
    }

    // Primary Sale: Buys a NEW block
    pub fn buy_block(ctx: Context<BuyBlock>, id: u32, color: [u8; 3]) -> Result<()> {
        let id_usize = id as usize;
        require!(id_usize < GRID_SIZE, CustomError::InvalidBlockId);

        let block = &mut ctx.accounts.block;
        let admin = &ctx.accounts.admin;
        let buyer = &ctx.accounts.buyer;
        let clock = Clock::get()?;
        
        let price = INITIAL_PRICE.checked_add(id.into()).ok_or(CustomError::MathOverflow)?;

        // Transfer SOL to Admin
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: buyer.to_account_info(),
                to: admin.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, price)?;

        // Initialize Block
        block.id = id;
        block.owner = buyer.key();
        block.color = color;
        block.price = 0; // Not for sale
        block.is_for_sale = false;
        block.timestamp = clock.unix_timestamp;
        
        emit!(BlockBought {
            id,
            buyer: buyer.key(),
            price,
        });

        Ok(())
    }

    // Secondary Sale: Buys an EXISTING block
    pub fn buy_resale(ctx: Context<BuyResale>, id: u32) -> Result<()> {
        let block = &mut ctx.accounts.block;
        let buyer = &ctx.accounts.buyer;
        let seller = &ctx.accounts.seller;
        let admin = &ctx.accounts.admin;
        let clock = Clock::get()?;

        require!(block.is_for_sale, CustomError::NotForSale);
        
        let price = block.price;
        require!(**buyer.lamports.borrow() >= price, CustomError::InsufficientFunds);
        
        // Calculate Fees
        let fee = price
            .checked_mul(FEE_BASIS_POINTS).ok_or(CustomError::MathOverflow)?
            .checked_div(10000).ok_or(CustomError::MathOverflow)?;
        
        let seller_amount = price.checked_sub(fee).ok_or(CustomError::MathOverflow)?;

        // Transfer to Seller
        let cpi_ctx_seller = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: buyer.to_account_info(),
                to: seller.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_ctx_seller, seller_amount)?;

        // Transfer to Admin
        let cpi_ctx_admin = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: buyer.to_account_info(),
                to: admin.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_ctx_admin, fee)?;

        // Update State
        block.owner = buyer.key();
        block.is_for_sale = false;
        block.price = 0;
        block.timestamp = clock.unix_timestamp;
        
        emit!(BlockResold {
            id,
            buyer: buyer.key(),
            price,
        });

        Ok(())
    }

    pub fn update_block(ctx: Context<UpdateBlock>, id: u32, text: String, image_url: String, url: String) -> Result<()> {
        let block = &mut ctx.accounts.block;

        // Copy strings to fixed-size arrays
        copy_string_to_array(&text, &mut block.text)?;
        copy_string_to_array(&image_url, &mut block.image_url)?;
        copy_string_to_array(&url, &mut block.url)?;

        emit!(BlockUpdated {
            id,
            owner: ctx.accounts.owner.key(),
        });

        Ok(())
    }

    pub fn sell_block(ctx: Context<SellBlock>, id: u32, price: u64) -> Result<()> {
        let block = &mut ctx.accounts.block;

        if price > 0 {
            block.is_for_sale = true;
            block.price = price;
        } else {
            block.is_for_sale = false; // Delist
            block.price = 0;
        }

        emit!(BlockSold {
            id,
            price,
            is_for_sale: block.is_for_sale,
        });

        Ok(())
    }

    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        let grid = &mut ctx.accounts.grid;
        grid.admin = new_admin;
        Ok(())
    }

    pub fn close_block(_ctx: Context<CloseBlock>, _id: u32) -> Result<()> {
        // Rent is automatically returned to the owner via the `close` constraint
        Ok(())
    }
}

// --------------------------------------------------------
// DATA STRUCTURES
// --------------------------------------------------------

#[account]
pub struct GridState {
    pub admin: Pubkey, // 32
}

#[account]
pub struct Block {
    pub id: u32,             // 4
    pub owner: Pubkey,       // 32
    pub price: u64,          // 8
    pub is_for_sale: bool,   // 1
    pub color: [u8; 3],      // 3
    pub text: [u8; 64],      // 64
    pub image_url: [u8; 128],// 128
    pub url: [u8; 128],      // 128
    pub timestamp: i64,      // 8
}

impl Block {
    // 8 (Discriminator) + 4 + 32 + 8 + 1 + 3 + 64 + 128 + 128 + 8 = 384
    pub const LEN: usize = 8 + 4 + 32 + 8 + 1 + 3 + 64 + 128 + 128 + 8;
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32, seeds = [b"grid"], bump)]
    pub grid: Account<'info, GridState>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: u32)]
pub struct BuyBlock<'info> {
    #[account(
        init,
        payer = buyer,
        space = Block::LEN,
        seeds = [b"block", id.to_le_bytes().as_ref()],
        bump
    )]
    pub block: Account<'info, Block>,

    #[account(
        mut, 
        seeds = [b"grid"], 
        bump,
        constraint = grid.admin == admin.key() @ CustomError::InvalidAdmin
    )]
    pub grid: Account<'info, GridState>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(mut)]
    pub admin: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: u32)]
pub struct BuyResale<'info> {
    #[account(
        mut,
        seeds = [b"block", id.to_le_bytes().as_ref()],
        bump,
        constraint = block.owner == seller.key() @ CustomError::Unauthorized
    )]
    pub block: Account<'info, Block>,

    #[account(
        seeds = [b"grid"], 
        bump,
        constraint = grid.admin == admin.key() @ CustomError::InvalidAdmin
    )]
    pub grid: Account<'info, GridState>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(mut)]
    pub seller: SystemAccount<'info>,

    #[account(mut)]
    pub admin: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: u32)]
pub struct UpdateBlock<'info> {
    #[account(
        mut,
        seeds = [b"block", id.to_le_bytes().as_ref()],
        bump,
        has_one = owner // Anchor can auto-check owner field
    )]
    pub block: Account<'info, Block>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(id: u32)]
pub struct SellBlock<'info> {
    #[account(
        mut,
        seeds = [b"block", id.to_le_bytes().as_ref()],
        bump,
        has_one = owner // Anchor can auto-check owner field
    )]
    pub block: Account<'info, Block>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    #[account(
        mut,
        seeds = [b"grid"],
        bump,
        has_one = admin
    )]
    pub grid: Account<'info, GridState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(id: u32)]
pub struct CloseBlock<'info> {
    #[account(
        mut,
        seeds = [b"block", id.to_le_bytes().as_ref()],
        bump,
        has_one = owner,
        close = owner
    )]
    pub block: Account<'info, Block>,
    #[account(mut)]
    pub owner: Signer<'info>,
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
    #[msg("Grid is already initialized.")]
    AlreadyInitialized,
    #[msg("Math Overflow.")]
    MathOverflow,
    #[msg("Insufficient funds.")]
    InsufficientFunds,
    #[msg("String is too long.")]
    StringTooLong,
}

#[event]
pub struct BlockBought {
    pub id: u32,
    pub buyer: Pubkey,
    pub price: u64,
}

#[event]
pub struct BlockUpdated {
    pub id: u32,
    pub owner: Pubkey,
}

#[event]
pub struct BlockSold {
    pub id: u32,
    pub price: u64,
    pub is_for_sale: bool,
}

#[event]
pub struct BlockResold {
    pub id: u32,
    pub buyer: Pubkey,
    pub price: u64,
}

// Helper
fn copy_string_to_array(s: &str, arr: &mut [u8]) -> Result<()> {
    if s.len() > arr.len() {
        return err!(CustomError::StringTooLong);
    }
    let end_index = s.len();
    let bytes = s.as_bytes();
    arr[..end_index].copy_from_slice(bytes);
    arr[end_index..].fill(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_copy_string_to_array_success() {
        let mut arr = [0u8; 10];
        copy_string_to_array("hello", &mut arr).unwrap();
        assert_eq!(&arr[0..5], b"hello");
        assert_eq!(arr[5], 0);
    }

    #[test]
    fn test_copy_string_to_array_exact_length() {
        let mut arr = [0u8; 5];
        copy_string_to_array("hello", &mut arr).unwrap();
        assert_eq!(&arr, b"hello");
    }

    #[test]
    fn test_copy_string_to_array_overflow() {
        let mut arr = [0u8; 4];
        let result = copy_string_to_array("hello", &mut arr);
        assert!(result.is_err());
    }

    #[test]
    fn test_copy_string_to_array_padding() {
        let mut arr = [1u8; 10]; // Fill with 1s
        copy_string_to_array("abc", &mut arr).unwrap();
        assert_eq!(&arr[0..3], b"abc");
        for i in 3..10 {
            assert_eq!(arr[i], 0);
        }
    }
}
