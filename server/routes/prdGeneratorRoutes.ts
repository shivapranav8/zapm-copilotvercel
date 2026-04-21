import { Router } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import { runPRDGenerator } from '../agents/prdGeneratorAgent';
import { writePRDExcel } from '../utils/prdExcelWriter';
import { writePRDHtml } from '../utils/prdHtmlWriter';

export const prdGeneratorRouter = Router();

const upload = multer({
    dest: '/tmp/prd-uploads/',
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

const CODE_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js', '.md', '.txt']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', 'public', '.vscode']);
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'package.json', 'tsconfig.json', 'vite.config.ts', 'tailwind.config.ts', 'postcss.config.js', '.eslintrc.js', 'next.config.js']);

// Directories that contain only UI library boilerplate — skip entirely
const UI_LIB_DIRS = new Set(['ui', 'shadcn', 'primitives', 'radix']);

/**
 * Returns true if a path is inside a UI library directory (shadcn/ui etc.)
 * These are generic components, not feature-specific code.
 */
function isUILibraryPath(parts: string[]): boolean {
    return parts.some(p => UI_LIB_DIRS.has(p.toLowerCase()));
}

/**
 * Extract readable text from a ZIP file.
 * Priority order: README/docs → App files → Feature components → Skip /ui/ boilerplate
 */
function extractZipContent(zipPath: string): string {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    // Separate into priority buckets
    const readmeFiles: { path: string; content: string }[] = [];
    const appFiles: { path: string; content: string }[] = [];
    const featureFiles: { path: string; content: string }[] = [];

    for (const entry of entries) {
        if (entry.isDirectory) continue;

        const entryPath = entry.entryName;
        const parts = entryPath.split('/');
        const fileName = parts[parts.length - 1];

        // Skip unwanted directories and files
        if (parts.some(p => SKIP_DIRS.has(p))) continue;
        if (SKIP_FILES.has(fileName)) continue;
        if (isUILibraryPath(parts)) continue;  // skip shadcn/ui boilerplate

        const ext = path.extname(entryPath).toLowerCase();
        if (!CODE_EXTENSIONS.has(ext)) continue;

        try {
            const content = entry.getData().toString('utf-8');
            if (!content.trim()) continue;

            const lower = fileName.toLowerCase();
            if (lower === 'readme.md' || lower.includes('readme') || ext === '.md') {
                readmeFiles.push({ path: entryPath, content });
            } else if (lower === 'app.tsx' || lower === 'app.jsx' || lower === 'app.ts' || lower === 'index.tsx') {
                appFiles.push({ path: entryPath, content });
            } else {
                featureFiles.push({ path: entryPath, content });
            }
        } catch {
            // Binary file — skip
        }
    }

    const allFiles = [...readmeFiles, ...appFiles, ...featureFiles];

    if (allFiles.length === 0) {
        throw new Error(
            'No feature-specific source files found in the ZIP. ' +
            'The ZIP appears to contain only UI library code (e.g. shadcn/ui). ' +
            'Please include your actual feature components (e.g. KPIMonitoring.tsx, Sidebar.tsx).'
        );
    }

    // Sort feature files by size descending — larger files are usually the primary feature components
    featureFiles.sort((a, b) => b.content.length - a.content.length);

    // Build output: include all files fully up to MAX_TOTAL
    // Only truncate individual files if they alone exceed MAX_PER_FILE
    const sections: string[] = [];
    let totalChars = 0;
    const MAX_TOTAL = 320_000;
    const MAX_PER_FILE = 40_000;

    for (const f of [...readmeFiles, ...appFiles, ...featureFiles]) {
        const truncated = f.content.length > MAX_PER_FILE
            ? f.content.slice(0, MAX_PER_FILE) + '\n// [truncated]'
            : f.content;
        const section = `\n=== FILE: ${f.path} ===\n${truncated}`;
        if (totalChars + section.length > MAX_TOTAL) break;
        sections.push(section);
        totalChars += section.length;
    }

    const appSpecific = appFiles.length + featureFiles.length;
    console.log(`📦 [PRD Generator] Extracted: ${readmeFiles.length} docs, ${appFiles.length} app files, ${featureFiles.length} feature files → ${sections.length} included (${totalChars} chars total)`);

    if (appSpecific <= 1) {
        console.warn(`⚠️  [PRD Generator] Very few app-specific files found (${appSpecific}). ZIP may be missing feature components.`);
    }

    return sections.join('\n');
}

/**
 * Extract text from a DOCX file using mammoth.
 */
async function extractDocxContent(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    if (!result.value.trim()) {
        throw new Error('DOCX file appears to be empty or has no extractable text.');
    }
    console.log(`📄 [PRD Generator] Extracted ${result.value.length} chars from DOCX`);
    return result.value;
}

/**
 * POST /api/prd-generator/generate
 * Accepts a ZIP (React source) or DOCX (MRD) file.
 * Returns a downloadable .xlsx PRD file.
 */
prdGeneratorRouter.post('/generate', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Include a file field named "file".' });
    }

    const { originalname, path: filePath } = req.file;
    const ext = path.extname(originalname).toLowerCase();
    console.log(`📋 [PRD Generator] Received: ${originalname} (${req.file.size} bytes, ext=${ext})`);

    try {
        // Step 1: Extract content
        let content: string;
        let sourceType: 'zip' | 'docx';

        if (ext === '.zip') {
            content = extractZipContent(filePath);
            sourceType = 'zip';
        } else if (ext === '.docx') {
            content = await extractDocxContent(filePath);
            sourceType = 'docx';
        } else {
            return res.status(400).json({
                error: `Unsupported file type: ${ext}. Please upload a .zip (React folder) or .docx (MRD).`,
            });
        }

        // Step 2: Generate PRD JSON via AI
        const zohoToken = (req as any).session?.zoho?.accessToken;
        const prdData = await runPRDGenerator(content, originalname, sourceType, zohoToken, req);

        // Step 3: Generate Excel + HTML
        const safeFeatureName = (prdData.featureName || 'PRD')
            .replace(/[^a-zA-Z0-9_\- ]/g, '')
            .replace(/\s+/g, '_')
            .slice(0, 60);

        const [excelBuffer, htmlContent] = await Promise.all([
            writePRDExcel(prdData),
            Promise.resolve(writePRDHtml(prdData)),
        ]);

        // Step 4: Bundle both into a ZIP and send
        const zip = new AdmZip();
        zip.addFile(`PRD_${safeFeatureName}.xlsx`, excelBuffer);
        zip.addFile(`PRD_${safeFeatureName}.html`, Buffer.from(htmlContent, 'utf-8'));
        const zipBuffer = zip.toBuffer();

        const zipFilename = `PRD_${safeFeatureName}.zip`;

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${zipFilename}"`,
            'Content-Length': String(zipBuffer.length),
        });
        res.send(zipBuffer);

        console.log(`✅ [PRD Generator] Sent ${zipFilename} (xlsx: ${excelBuffer.length}B, html: ${htmlContent.length}B, zip: ${zipBuffer.length}B)`);
    } catch (error) {
        console.error('❌ [PRD Generator] Failed:', error);
        res.status(500).json({
            error: 'PRD generation failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    } finally {
        fs.unlink(filePath, () => {});
    }
});
