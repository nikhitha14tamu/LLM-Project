// utils/chunking.ts

// Splits file content into chunks with an optional overlap
export function chunkFileContentWithOverlap(content: string, chunkSize: number = 500, overlap: number = 20): string[] {
    const lines = content.split('\n'); // Split content into lines
    const chunks = [];
    for (let i = 0; i < lines.length; i += chunkSize) {
        const end = Math.min(i + chunkSize + overlap, lines.length);
        chunks.push(lines.slice(i, end).join('\n')); // Create chunks with overlap
    }
    return chunks;
}


