import { NextResponse } from "next/server";
import path from "path";
import { writeFile, mkdir } from "fs/promises";

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

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = Date.now() + "_" + file.name.replaceAll(" ", "_");

        // Ensure uploads directory exists (in project root, not public)
        const uploadDir = path.join(process.cwd(), "uploads");
        await mkdir(uploadDir, { recursive: true });

        const filepath = path.join(uploadDir, filename);
        await writeFile(filepath, buffer);

        // Return the dynamic API URL
        const fileUrl = `/api/images/${filename}`;

        return NextResponse.json({ url: fileUrl, success: true });
    } catch (error) {
        console.error("Upload Error:", error);
        return NextResponse.json(
            { error: "Failed to upload file." },
            { status: 500 }
        );
    }
}
