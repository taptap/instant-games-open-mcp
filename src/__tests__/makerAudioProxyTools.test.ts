import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  materializeRemoteProxyToolAssets,
  prepareRemoteProxyToolArgs,
  prepareRemoteProxyToolArgsAsync,
} from '../maker/server/proxyAssets';

describe('Maker audio proxy tools', () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-audio-proxy-'));
  });

  afterEach(() => fs.rmSync(targetDir, { recursive: true, force: true }));

  test('rewrites local reference audio to a data URL and preserves existing data URLs', () => {
    fs.mkdirSync(path.join(targetDir, 'assets/audio'), { recursive: true });
    const source = Buffer.from('wav-source');
    fs.writeFileSync(path.join(targetDir, 'assets/audio/reference.wav'), source);
    const existing = `data:audio/mpeg;base64,${Buffer.from('mp3').toString('base64')}`;

    const args = prepareRemoteProxyToolArgs({
      toolName: 'text_to_dialogue',
      targetDir,
      args: {
        inputs: [
          { character_name: 'A', text: 'hello', reference_audio: 'reference.wav' },
          { character_name: 'B', text: 'hi', reference_audio: existing },
        ],
      },
    });

    expect(args.inputs).toEqual([
      {
        character_name: 'A',
        text: 'hello',
        reference_audio: `data:audio/wav;base64,${source.toString('base64')}`,
      },
      { character_name: 'B', text: 'hi', reference_audio: existing },
    ]);
  });

  test('converts HTTP reference audio asynchronously and rejects mutual exclusion', async () => {
    const fetchImpl = (async () =>
      new Response(Buffer.from('mp3-http'), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      })) as typeof fetch;
    const args = await prepareRemoteProxyToolArgsAsync({
      toolName: 'text_to_dialogue',
      targetDir,
      fetchImpl,
      args: {
        inputs: [{ character_name: 'A', text: 'hello', reference_audio: 'https://x.test/a' }],
      },
    });
    expect(args.inputs[0].reference_audio).toBe(
      `data:audio/mpeg;base64,${Buffer.from('mp3-http').toString('base64')}`
    );

    expect(() =>
      prepareRemoteProxyToolArgs({
        toolName: 'text_to_dialogue',
        targetDir,
        args: {
          inputs: [
            { reference_audio: existingDataUrl(), reference_audio_path: 'assets/audio/a.mp3' },
          ],
        },
      })
    ).toThrow(/mutually exclusive/);
  });

  test('materializes audio files with collision suffixes and registry entries', async () => {
    const now = new Date('2026-07-16T10:11:12Z');
    const fetchImpl = (async (url: string) =>
      new Response(Buffer.from(url.includes('bad') ? '' : `bytes-${url}`), {
        status: url.includes('bad') ? 500 : 200,
      })) as typeof fetch;
    fs.mkdirSync(path.join(targetDir, 'assets/audio/sfx'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'assets/audio/sfx/laser.mp3'), 'old');

    const result = await materializeRemoteProxyToolAssets({
      toolName: 'batch_sound_effects',
      targetDir,
      now,
      fetchImpl,
      result: proxyTextResult({
        success: false,
        audio_files: [
          {
            kind: 'sound_effect',
            name: 'laser',
            audioUrl: 'https://x.test/good',
            mimeType: 'audio/mpeg',
            format: 'mp3',
            suggestedFileName: 'laser.mp3',
            targetDirectory: 'assets/audio/sfx',
          },
          {
            kind: 'sound_effect',
            name: 'bad',
            audioUrl: 'https://x.test/bad',
            format: 'ogg_opus',
            suggestedFileName: 'bad.ogg',
            targetDirectory: 'assets/audio/sfx',
          },
          {
            kind: 'sound_effect',
            name: 'escape',
            audioUrl: 'https://x.test/escape',
            suggestedFileName: '../escape.mp3',
            targetDirectory: 'assets/audio/sfx',
          },
        ],
        failed: [{ name: 'missing', error: 'provider failed' }],
      }),
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.audio_files[0].localPath).toBe('assets/audio/sfx/laser_2.mp3');
    expect(
      fs.readFileSync(path.join(targetDir, payload.audio_files[0].localPath), 'utf8')
    ).toContain('https://x.test/good');
    expect(payload.audio_files[1].download.success).toBe(false);
    expect(payload.audio_files[2].download.success).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'escape.mp3'))).toBe(false);
    const registry = JSON.parse(
      fs.readFileSync(path.join(targetDir, '.maker/assets/generated-assets.json'), 'utf8')
    );
    expect(registry[payload.audio_files[0].localPath].tool).toBe('batch_sound_effects');
  });

  test('does not materialize audition candidates', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'audition_voices_for_character',
      targetDir,
      result: proxyTextResult({
        success: true,
        candidates: [{ index: 1, audioUrl: 'https://x.test/audition.mp3', generatedVoiceId: 'v1' }],
      }),
    });
    expect(result.content[0].text).toContain('audition.mp3');
    expect(fs.existsSync(path.join(targetDir, 'assets/audio'))).toBe(false);
  });

  test('persists Doubao reference and merges mapping atomically', async () => {
    fs.mkdirSync(path.join(targetDir, '.project'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'assets/audio/voice-reference'), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, '.project/audio-voice-mapping.json'),
      JSON.stringify({
        version: 4,
        provider: 'doubao',
        characters: { Other: { created_at: 'old' } },
      })
    );
    const mp3 = validMp3Fixture();
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'confirm_character_voice',
      targetDir,
      fetchImpl: (async () => new Response(mp3, { status: 200 })) as typeof fetch,
      now: new Date('2026-07-16T10:11:12Z'),
      result: proxyTextResult({
        success: true,
        characterName: 'A',
        referenceAudio: {
          audioUrl: 'https://x.test/ref.mp3',
          targetPath: 'assets/audio/voice-reference/a.mp3',
        },
        mapping: {
          provider: 'doubao',
          characterName: 'A',
          reference_audio_path: 'assets/audio/voice-reference/a.mp3',
          reference_format: 'mp3',
          reference_duration_seconds: 2,
        },
      }),
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.referenceAudio.download.success).toBe(true);
    expect(fs.readFileSync(path.join(targetDir, 'assets/audio/voice-reference/a.mp3'))).toEqual(
      mp3
    );
    const mapping = JSON.parse(
      fs.readFileSync(path.join(targetDir, '.project/audio-voice-mapping.json'), 'utf8')
    );
    expect(mapping.characters.Other.created_at).toBe('old');
    expect(mapping.characters.A.reference_format).toBe('mp3');
    expect(mapping.default_language).toBe('cmn');
  });

  test('rolls back a replaced Doubao reference when mapping rename fails', async () => {
    const referencePath = path.join(targetDir, 'assets/audio/voice-reference/a.mp3');
    const mappingPath = path.join(targetDir, '.project/audio-voice-mapping.json');
    fs.mkdirSync(path.dirname(referencePath), { recursive: true });
    fs.mkdirSync(path.dirname(mappingPath), { recursive: true });
    const oldReference = Buffer.from('old-reference');
    const oldMapping = Buffer.from('{"version":4,"provider":"doubao","characters":{}}');
    fs.writeFileSync(referencePath, oldReference);
    fs.writeFileSync(mappingPath, oldMapping);
    const originalRename = fs.renameSync;
    const rename = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(destination) === mappingPath) throw new Error('forced mapping rename failure');
      return originalRename(source, destination);
    });
    try {
      const result = await materializeRemoteProxyToolAssets({
        toolName: 'confirm_character_voice',
        targetDir,
        fetchImpl: (async () => new Response(validMp3Fixture(), { status: 200 })) as typeof fetch,
        result: proxyTextResult({
          success: true,
          characterName: 'A',
          referenceAudio: {
            audioUrl: 'https://x.test/ref.mp3',
            targetPath: 'assets/audio/voice-reference/a.mp3',
          },
          mapping: {
            provider: 'doubao',
            characterName: 'A',
            reference_audio_path: 'assets/audio/voice-reference/a.mp3',
          },
        }),
      });
      expect(JSON.parse(result.content[0].text).referenceAudio.download.success).toBe(false);
      expect(fs.readFileSync(referencePath)).toEqual(oldReference);
      expect(fs.readFileSync(mappingPath)).toEqual(oldMapping);
    } finally {
      rename.mockRestore();
    }
  });

  test('merges ElevenLabs mapping without creating audio files', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'confirm_character_voice',
      targetDir,
      result: proxyTextResult({
        success: true,
        cleanupWarning: 'do not retry',
        mapping: {
          provider: 'elevenlabs',
          characterName: 'A',
          voice_id: 'voice-1',
        },
      }),
    });
    expect(JSON.parse(result.content[0].text).cleanupWarning).toBe('do not retry');
    expect(fs.existsSync(path.join(targetDir, 'assets/audio'))).toBe(false);
    const mapping = JSON.parse(
      fs.readFileSync(path.join(targetDir, '.project/elevenlabs-voice-mapping.json'), 'utf8')
    );
    expect(mapping.version).toBe('1.0');
    expect(mapping.characters.A.voice_id).toBe('voice-1');
  });
});

function proxyTextResult(value: unknown): any {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function existingDataUrl(): string {
  return `data:audio/mpeg;base64,${Buffer.from('mp3').toString('base64')}`;
}

function validMp3Fixture(): Buffer {
  const frameLength = 417;
  const frame = Buffer.alloc(frameLength);
  Buffer.from([0xff, 0xfb, 0x90, 0]).copy(frame);
  return Buffer.concat([frame, frame]);
}
