import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/utils/s3";
import sharp from "sharp";

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json(
                { error: "No file received." },
                { status: 400 }
            );
        }

        // --- VALIDATION ---
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: "Invalid file type. Only PNG, JPEG, GIF, and WEBP are allowed." },
                { status: 400 }
            );
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json(
                { error: "File too large. Maximum size is 5MB." },
                { status: 400 }
            );
        }
        // ------------------

        const buffer = Buffer.from(await file.arrayBuffer());

        // --- OPTIMIZATION (Sharp) ---
        const optimizedBuffer = await sharp(buffer)
            .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

        // Sanitize filename & change extension to webp
        const originalName = file.name.replace(/\.[^/.]+$/, ""); // remove extension
        const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const filename = `${Date.now()}_${sanitizedName}.webp`;
        // -----------------------------

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: filename,
            Body: optimizedBuffer,
            ContentType: "image/webp",
            // ACL: "public-read", 
        });

        await s3Client.send(command);

        const region = process.env.HETZNER_REGION || "fsn1";
        const fileUrl = `https://${BUCKET_NAME}.${region}.your-objectstorage.com/${filename}`;

        return NextResponse.json({ url: fileUrl, success: true });
    } catch (error) {
        console.error("Upload Error:", error);
        return NextResponse.json(
            { error: "Failed to upload file." },
            { status: 500 }
        );
    }
}
