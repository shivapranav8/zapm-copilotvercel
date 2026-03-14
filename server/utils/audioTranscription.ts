import fs from 'fs';
import os from 'os';
import OpenAI from 'openai';
import path from 'path';
import chunk from 'lodash/chunk';
import ffmpeg from 'fluent-ffmpeg';
import { extractAudioFromVideo } from './videoProcessing';
try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
} catch (e) {
    console.warn('⚠️  Could not set ffmpeg path (likely running bundled Mac binary on Linux Catalyst). Video processing will fail.');
}

// Lazy OpenAI client — initialized only when actually used (not at startup)
let _openai: OpenAI | null = null;
function getOpenAI() {
    if (!_openai) {
        _openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 20 * 60 * 1000,
        });
    }
    return _openai;
}

/**
 * Transcribe large audio file by splitting into chunks
 */
async function transcribeLargeAudio(audioFilePath: string): Promise<string> {
    console.log('📦 File is too large for single request (> 24MB). Splitting into chunks...');

    const chunkDir = path.join(path.dirname(audioFilePath), 'chunks_' + Date.now());
    if (!fs.existsSync(chunkDir)) {
        fs.mkdirSync(chunkDir);
    }

    try {
        // Split audio into 10-minute chunks (approx 10MB for 128k bitrate)
        await new Promise<void>((resolve, reject) => {
            ffmpeg(audioFilePath)
                .output(path.join(chunkDir, 'chunk_%03d.mp3'))
                .audioCodec('libmp3lame')
                .audioBitrate('128k')
                .format('segment')
                .outputOptions(['-segment_time', '600', '-reset_timestamps', '1'])
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .run();
        });

        const chunkFiles = fs.readdirSync(chunkDir)
            .filter(f => f.endsWith('.mp3'))
            .sort()
            .map(f => path.join(chunkDir, f));

        console.log(`🧩 Split into ${chunkFiles.length} chunks. Transcribing sequentially...`);

        let fullTranscript = '';

        for (let i = 0; i < chunkFiles.length; i++) {
            const chunkPath = chunkFiles[i];
            console.log(`🎤 Transcribing chunk ${i + 1}/${chunkFiles.length}...`);

            // Transcribe each chunk
            // Note: We call the API directly here to update progress
            const audioStream = fs.createReadStream(chunkPath);
            const response = await getOpenAI().audio.translations.create({
                file: audioStream,
                model: 'whisper-1',
                response_format: 'text',
            });

            fullTranscript += response + ' ';
        }

        return fullTranscript.trim();

    } catch (error) {
        console.error('❌ Chunk transcription failed:', error);
        throw error;
    } finally {
        // Cleanup chunks
        try {
            if (fs.existsSync(chunkDir)) {
                fs.rmSync(chunkDir, { recursive: true, force: true });
                console.log('🗑️  Cleaned up audio chunks');
            }
        } catch (e) {
            console.error('Failed to cleanup chunks:', e);
        }
    }
}

/**
 * Transcribe audio file using OpenAI Whisper API
 * Supports multilingual audio including Tanglish (Tamil + English)
 */
export async function transcribeAudio(audioFilePath: string): Promise<string> {
    console.log('\n🎤 Transcribing audio with OpenAI Whisper...');
    console.log(`📁 File: ${audioFilePath}`);

    try {
        // Check file size
        const stats = fs.statSync(audioFilePath);
        const fileSizeInBytes = stats.size;
        const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

        console.log(`📊 File size: ${fileSizeInMB.toFixed(2)} MB`);

        // If file > 24MB, use chunking (limit is 25MB)
        if (fileSizeInMB > 24) {
            return await transcribeLargeAudio(audioFilePath);
        }

        // Create a read stream from the audio file
        const audioStream = fs.createReadStream(audioFilePath);

        // Use translations endpoint — auto-detects Tamil/Tanglish and outputs English
        let transcription: string;
        try {
            transcription = await getOpenAI().audio.translations.create({
                file: audioStream,
                model: 'whisper-1',
                response_format: 'text',
            }) as string;
        } finally {
            audioStream.destroy();
        }

        console.log('✅ Transcription completed');
        console.log(`📝 Transcript length: ${transcription.length} characters`);

        return transcription;
    } catch (error) {
        console.error('❌ Transcription failed:', error);
        throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Transcribe video file (extracts audio first, then transcribes)
 */
export async function transcribeVideo(videoFilePath: string): Promise<{ transcript: string; audioPath: string }> {
    console.log('\n🎬 Processing video file...');
    console.log(`📁 Video: ${videoFilePath}`);

    try {
        // Extract audio from video
        const audioPath = await extractAudioFromVideo(videoFilePath);

        // Transcribe the extracted audio
        const transcript = await transcribeAudio(audioPath);

        return { transcript, audioPath };
    } catch (error) {
        console.error('❌ Video transcription failed:', error);
        throw new Error(`Failed to transcribe video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Transcribe audio from URL (download first, then transcribe)
 */
export async function transcribeAudioFromUrl(audioUrl: string): Promise<string> {
    console.log('\n🌐 Downloading audio from URL...');
    console.log(`🔗 URL: ${audioUrl}`);

    try {
        // Download the audio file
        const response = await fetch(audioUrl);
        if (!response.ok) {
            throw new Error(`Failed to download audio: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Save temporarily
        const tempFilePath = path.join(os.tmpdir(), `meeting_audio_${Date.now()}.mp3`);
        fs.writeFileSync(tempFilePath, buffer);

        console.log(`✅ Audio downloaded to: ${tempFilePath}`);

        // Transcribe
        const transcript = await transcribeAudio(tempFilePath);

        // Clean up temp file
        fs.unlinkSync(tempFilePath);
        console.log('🗑️  Temporary file deleted');

        return transcript;
    } catch (error) {
        console.error('❌ Failed to download/transcribe audio:', error);
        throw new Error(`Failed to process audio from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
