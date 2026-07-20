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

  test('requires an explicit character gender before forwarding a voice audition', () => {
    expect(() =>
      prepareRemoteProxyToolArgs({
        toolName: 'audition_voices_for_character',
        targetDir,
        args: {
          character_name: '暗影刺客',
          character_description: 'Young adult female rogue assassin',
          audition_line: '目标已经进入视野。',
        },
      })
    ).toThrow(/voice_profile\.gender.*required.*male.*female/i);

    const args = {
      character_name: '暗影刺客',
      character_description: 'Young adult female rogue assassin',
      audition_line: '目标已经进入视野。',
      voice_profile: { gender: 'female' },
    };
    expect(
      prepareRemoteProxyToolArgs({
        toolName: 'audition_voices_for_character',
        targetDir,
        args,
      })
    ).toEqual(args);
  });

  test('converts local project reference paths to data URLs and rejects missing files', () => {
    fs.mkdirSync(path.join(targetDir, 'assets/audio'), { recursive: true });
    const source = Buffer.from('wav-source');
    fs.writeFileSync(path.join(targetDir, 'assets/audio/reference.wav'), source);
    const existing = `data:audio/mpeg;base64,${Buffer.from('mp3').toString('base64')}`;
    const localDataUrl = `data:audio/wav;base64,${source.toString('base64')}`;

    const args = prepareRemoteProxyToolArgs({
      toolName: 'text_to_dialogue',
      targetDir,
      args: {
        inputs: [
          { character_name: 'A', text: 'hello', reference_audio: 'reference.wav' },
          {
            character_name: 'B',
            text: 'hi',
            reference_audio: 'workspace/assets/audio/reference.wav',
          },
          {
            character_name: 'C',
            text: 'hey',
            reference_audio: path.join(targetDir, 'assets/audio/reference.wav'),
          },
          { character_name: 'D', text: 'yo', reference_audio: existing },
        ],
      },
    });

    expect(args.inputs).toEqual([
      {
        character_name: 'A',
        text: 'hello',
        reference_audio: localDataUrl,
      },
      {
        character_name: 'B',
        text: 'hi',
        reference_audio: localDataUrl,
      },
      {
        character_name: 'C',
        text: 'hey',
        reference_audio: localDataUrl,
      },
      { character_name: 'D', text: 'yo', reference_audio: existing },
    ]);

    expect(() =>
      prepareRemoteProxyToolArgs({
        toolName: 'text_to_dialogue',
        targetDir,
        args: {
          inputs: [
            {
              character_name: 'E',
              text: 'missing',
              reference_audio: 'assets/audio/missing.mp3',
            },
          ],
        },
      })
    ).toThrow(/local|not found|missing/i);

    const outsidePath = path.join(targetDir, '..', 'maker-audio-outside-source.mp3');
    fs.writeFileSync(outsidePath, 'outside-audio');
    try {
      expect(() =>
        prepareRemoteProxyToolArgs({
          toolName: 'text_to_dialogue',
          targetDir,
          args: {
            inputs: [{ reference_audio: outsidePath }],
          },
        })
      ).toThrow(/project|assets\/audio|reference_audio/i);
    } finally {
      fs.rmSync(outsidePath, { force: true });
    }
  });

  test('reuses a confirmed local Doubao reference without user-supplied audio', () => {
    const referencePath = 'assets/audio/voice-reference/hero.mp3';
    const referenceBytes = Buffer.from('confirmed-reference');
    fs.mkdirSync(path.join(targetDir, '.project'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'assets/audio/voice-reference'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, referencePath), referenceBytes);
    fs.writeFileSync(
      path.join(targetDir, '.project/audio-voice-mapping.json'),
      JSON.stringify({
        version: 4,
        provider: 'doubao',
        characters: {
          Hero: {
            provider: 'doubao',
            reference_audio_path: referencePath,
          },
        },
      })
    );

    const args = prepareRemoteProxyToolArgs({
      toolName: 'text_to_dialogue',
      targetDir,
      args: {
        inputs: [{ character_name: 'Hero', text: 'hello' }],
      },
    });

    expect(args.inputs).toEqual([
      {
        character_name: 'Hero',
        text: 'hello',
        reference_audio: `data:audio/mpeg;base64,${referenceBytes.toString('base64')}`,
      },
    ]);
  });

  test('does not encode a mapped reference symlink that escapes the project', () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-audio-reference-outside-'));
    const outsideAudio = path.join(outsideDir, 'secret.mp3');
    const referencePath = 'assets/audio/voice-reference/hero.mp3';
    try {
      fs.writeFileSync(outsideAudio, 'secret-reference');
      fs.mkdirSync(path.join(targetDir, '.project'), { recursive: true });
      fs.mkdirSync(path.join(targetDir, 'assets/audio/voice-reference'), { recursive: true });
      fs.symlinkSync(outsideAudio, path.join(targetDir, referencePath));
      fs.writeFileSync(
        path.join(targetDir, '.project/audio-voice-mapping.json'),
        JSON.stringify({
          version: 4,
          provider: 'doubao',
          characters: {
            Hero: { provider: 'doubao', reference_audio_path: referencePath },
          },
        })
      );

      expect(() =>
        prepareRemoteProxyToolArgs({
          toolName: 'text_to_dialogue',
          targetDir,
          args: { inputs: [{ character_name: 'Hero', text: 'hello' }] },
        })
      ).toThrow(/outside|project|symlink/i);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  test('uses the real project file extension for an internal audio symlink data URL', () => {
    const audioDir = path.join(targetDir, 'assets/audio');
    fs.mkdirSync(audioDir, { recursive: true });
    fs.writeFileSync(path.join(audioDir, 'reference.wav'), Buffer.from('wav-source'));
    fs.symlinkSync('reference.wav', path.join(audioDir, 'reference.mp3'));

    const args = prepareRemoteProxyToolArgs({
      toolName: 'text_to_dialogue',
      targetDir,
      args: {
        inputs: [
          {
            character_name: 'A',
            text: 'hello',
            reference_audio: 'assets/audio/reference.mp3',
          },
        ],
      },
    });

    expect(args.inputs[0].reference_audio).toMatch(/^data:audio\/wav;base64,/);
  });

  test('accepts the same case-insensitive parameterized data URLs as the server', () => {
    const referenceAudio = `DATA:AUDIO/MPEG;charset=utf-8;BASE64,${Buffer.from('hello')
      .toString('base64')
      .replace('V', 'V\n')}`;

    const args = prepareRemoteProxyToolArgs({
      toolName: 'text_to_dialogue',
      targetDir,
      args: {
        inputs: [{ character_name: 'A', text: 'hello', reference_audio: referenceAudio }],
      },
    });

    expect(args.inputs[0].reference_audio).toBe(referenceAudio);
  });

  test('preserves HTTP reference audio for server-side validation and rejects mutual exclusion', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const args = await prepareRemoteProxyToolArgsAsync({
      toolName: 'text_to_dialogue',
      targetDir,
      // @ts-expect-error argument preparation never fetches remote audio
      fetchImpl,
      args: {
        inputs: [{ character_name: 'A', text: 'hello', reference_audio: 'https://x.test/a' }],
      },
    });
    expect(args.inputs[0].reference_audio).toBe('https://x.test/a');
    expect(fetchImpl).not.toHaveBeenCalled();

    const legacyBytes = Buffer.from('legacy-reference');
    fs.mkdirSync(path.join(targetDir, 'assets/audio'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'assets/audio/legacy.mp3'), legacyBytes);
    expect(
      prepareRemoteProxyToolArgs({
        toolName: 'text_to_dialogue',
        targetDir,
        args: {
          inputs: [
            {
              character_name: 'Legacy',
              text: 'hello',
              reference_audio_path: 'workspace/assets/audio/legacy.mp3',
            },
          ],
        },
      }).inputs
    ).toEqual([
      {
        character_name: 'Legacy',
        text: 'hello',
        reference_audio: `data:audio/mpeg;base64,${legacyBytes.toString('base64')}`,
      },
    ]);

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

  test('explains how to restore a missing reference resolved from the local Doubao mapping', () => {
    fs.mkdirSync(path.join(targetDir, '.project'), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, '.project/audio-voice-mapping.json'),
      JSON.stringify({
        version: 4,
        provider: 'doubao',
        characters: {
          Hero: {
            provider: 'doubao',
            reference_audio_path: 'assets/audio/voice-reference/missing.mp3',
          },
        },
      })
    );

    expect(() =>
      prepareRemoteProxyToolArgs({
        toolName: 'text_to_dialogue',
        targetDir,
        args: { inputs: [{ character_name: 'Hero', text: 'hello' }] },
      })
    ).toThrow(/Doubao voice mapping.*Hero.*confirm_character_voice/i);
  });

  test.each([null, '', '   ', 'data:audio/mpeg;base64,   '])(
    'treats omitted canonical reference %p as compatible with the legacy project path',
    (referenceAudio) => {
      const legacyBytes = Buffer.from('legacy-reference');
      fs.mkdirSync(path.join(targetDir, 'assets/audio'), { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'assets/audio/legacy.mp3'), legacyBytes);
      const args = prepareRemoteProxyToolArgs({
        toolName: 'text_to_dialogue',
        targetDir,
        args: {
          inputs: [
            {
              character_name: 'Legacy',
              text: 'hello',
              reference_audio: referenceAudio,
              reference_audio_path: 'workspace/assets/audio/legacy.mp3',
            },
          ],
        },
      });

      expect(args.inputs).toEqual([
        {
          character_name: 'Legacy',
          text: 'hello',
          reference_audio: `data:audio/mpeg;base64,${legacyBytes.toString('base64')}`,
        },
      ]);
    }
  );

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

  test('rejects unsupported audio output contracts without writing a file', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'text_to_sound_effect',
      targetDir,
      fetchImpl: (async () => new Response(Buffer.from('bytes'), { status: 200 })) as typeof fetch,
      result: proxyTextResult({
        success: true,
        audio_files: [
          {
            kind: 'sound_effect',
            name: 'bad',
            audioUrl: 'https://x.test/bad',
            mimeType: 'audio/wav',
            format: 'mp3',
            suggestedFileName: 'bad.wav',
            targetDirectory: 'assets/audio/sfx',
          },
        ],
      }),
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.audio_files[0].download.success).toBe(false);
    expect(payload.audio_files[0].download.error).toMatch(/format|mime|extension/i);
    expect(fs.existsSync(path.join(targetDir, 'assets/audio/sfx/bad.wav'))).toBe(false);
  });

  test('accepts all supported generated audio format contracts', async () => {
    const cases = [
      ['mp3', 'audio/mpeg', '.mp3'],
      ['wav', 'audio/wav', '.wav'],
      ['pcm', 'audio/l16', '.pcm'],
      ['ogg_opus', 'audio/ogg', '.ogg'],
    ] as const;
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'batch_sound_effects',
      targetDir,
      fetchImpl: (async () => new Response(Buffer.from('bytes'), { status: 200 })) as typeof fetch,
      result: proxyTextResult({
        success: true,
        audio_files: cases.map(([format, mimeType, extension]) => ({
          kind: 'sound_effect',
          name: format,
          audioUrl: `https://x.test/${format}`,
          mimeType,
          format,
          suggestedFileName: `${format}${extension}`,
          targetDirectory: 'assets/audio/sfx',
        })),
      }),
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.audio_files.every((item: any) => item.download.success)).toBe(true);
    expect(payload.audio_files.map((item: any) => item.localPath)).toEqual([
      'assets/audio/sfx/mp3.mp3',
      'assets/audio/sfx/wav.wav',
      'assets/audio/sfx/pcm.pcm',
      'assets/audio/sfx/ogg_opus.ogg',
    ]);
  });

  test('enforces tool-specific audio kind and directory contracts', async () => {
    const cases = [
      ['text_to_sound_effect', 'dialogue', 'assets/audio/voice'],
      ['batch_sound_effects', 'dialogue', 'assets/audio/voice'],
      ['text_to_dialogue', 'sound_effect', 'assets/audio/sfx'],
    ] as const;
    for (const [toolName, kind, targetDirectory] of cases) {
      const result = await materializeRemoteProxyToolAssets({
        toolName,
        targetDir,
        fetchImpl: (async () =>
          new Response(Buffer.from('bytes'), { status: 200 })) as typeof fetch,
        result: proxyTextResult({
          success: true,
          audio_files: [
            {
              kind,
              name: 'mismatch',
              audioUrl: 'https://x.test/mismatch',
              mimeType: 'audio/mpeg',
              format: 'mp3',
              suggestedFileName: 'mismatch.mp3',
              targetDirectory,
            },
          ],
        }),
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.audio_files[0].download.success).toBe(false);
      expect(payload.audio_files[0].download.error).toMatch(/kind|targetDirectory/i);
      expect(fs.existsSync(path.join(targetDir, targetDirectory, 'mismatch.mp3'))).toBe(false);
    }
  });

  test('rejects oversized data URLs and oversized local project files', async () => {
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 1);
    await expect(
      prepareRemoteProxyToolArgsAsync({
        toolName: 'text_to_dialogue',
        targetDir,
        args: {
          inputs: [
            {
              reference_audio: `data:audio/mpeg;base64,${oversized.toString('base64')}`,
            },
          ],
        },
      })
    ).rejects.toThrow(/20 MiB|too large/i);

    const localPath = path.join(targetDir, 'assets/audio/oversized.mp3');
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, oversized);
    await expect(
      prepareRemoteProxyToolArgsAsync({
        toolName: 'text_to_dialogue',
        targetDir,
        args: { inputs: [{ reference_audio: localPath }] },
      })
    ).rejects.toThrow(/20 MiB|too large/i);
  });

  test('rejects reference audio inputs whose encoded total exceeds 28 MiB', async () => {
    const encoded = `data:audio/mpeg;base64,${Buffer.alloc(11 * 1024 * 1024, 1).toString('base64')}`;
    await expect(
      prepareRemoteProxyToolArgsAsync({
        toolName: 'text_to_dialogue',
        targetDir,
        args: {
          inputs: [{ reference_audio: encoded }, { reference_audio: encoded }],
        },
      })
    ).rejects.toThrow(/28 MiB|input total/i);

    const legacyPath = path.join(targetDir, 'assets/audio/legacy-large.mp3');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, Buffer.alloc(11 * 1024 * 1024, 1));
    await expect(
      prepareRemoteProxyToolArgsAsync({
        toolName: 'text_to_dialogue',
        targetDir,
        args: {
          inputs: [
            { reference_audio_path: 'assets/audio/legacy-large.mp3' },
            { reference_audio_path: 'assets/audio/legacy-large.mp3' },
          ],
        },
      })
    ).rejects.toThrow(/28 MiB|input total/i);
  });

  test('rejects Doubao reference audio over 1 MiB', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'confirm_character_voice',
      targetDir,
      fetchImpl: (async () =>
        new Response(Buffer.alloc(1024 * 1024 + 1, 1), { status: 200 })) as typeof fetch,
      result: proxyTextResult({
        success: true,
        characterName: 'A',
        referenceAudio: {
          audioUrl: 'https://x.test/ref.mp3',
          targetPath: 'assets/audio/voice-reference/a.mp3',
        },
        mapping: { provider: 'doubao', characterName: 'A' },
      }),
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.referenceAudio.download.success).toBe(false);
    expect(payload.referenceAudio.download.error).toMatch(/1 MiB|valid MP3/i);
    expect(fs.existsSync(path.join(targetDir, 'assets/audio/voice-reference/a.mp3'))).toBe(false);
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
    expect(payload.next_step_hint).toBe(
      'Call text_to_dialogue with character_name and text. The confirmed voice mapping is reused automatically; omit reference_audio unless the user requests a one-time override.'
    );
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
          next_step_hint:
            'Call text_to_dialogue with character_name and text. The confirmed voice mapping is reused automatically; omit reference_audio unless the user requests a one-time override.',
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
      const payload = JSON.parse(result.content[0].text);
      expect(payload.referenceAudio.download.success).toBe(false);
      expect(payload.next_step_hint).toBeUndefined();
      expect(fs.readFileSync(referencePath)).toEqual(oldReference);
      expect(fs.readFileSync(mappingPath)).toEqual(oldMapping);
    } finally {
      rename.mockRestore();
    }
  });

  test('merges ElevenLabs mapping without creating audio files', async () => {
    fs.mkdirSync(path.join(targetDir, '.project'), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, '.project/elevenlabs-voice-mapping.json'),
      JSON.stringify({
        version: '1.0',
        provider: 'elevenlabs',
        default_language: 'cmn',
        default_stability: 0.5,
        special_voices: {},
        characters: { Existing: { provider: 'elevenlabs', voice_id: 'voice-existing' } },
      })
    );
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
    expect(JSON.parse(result.content[0].text).next_step_hint).toBe(
      'Call text_to_dialogue with character_name and text. The confirmed voice mapping is reused automatically; omit reference_audio unless the user requests a one-time override.'
    );
    expect(fs.existsSync(path.join(targetDir, 'assets/audio'))).toBe(false);
    const mapping = JSON.parse(
      fs.readFileSync(path.join(targetDir, '.project/elevenlabs-voice-mapping.json'), 'utf8')
    );
    expect(mapping.version).toBe('1.0');
    expect(mapping).not.toHaveProperty('default_language');
    expect(mapping).not.toHaveProperty('default_stability');
    expect(mapping).not.toHaveProperty('special_voices');
    expect(mapping.characters.Existing.voice_id).toBe('voice-existing');
    expect(mapping.characters.A.voice_id).toBe('voice-1');

    const dialogueArgs = prepareRemoteProxyToolArgs({
      toolName: 'text_to_dialogue',
      targetDir,
      args: { inputs: [{ character_name: 'A', text: 'hello' }] },
    });
    expect(dialogueArgs.inputs).toEqual([
      {
        character_name: 'A',
        text: 'hello',
        _local_voice_id: 'voice-1',
      },
    ]);
  });

  test('returns ElevenLabs mapping persistence diagnostics without dropping remote success fields', async () => {
    const mappingPath = path.join(targetDir, '.project/elevenlabs-voice-mapping.json');
    const originalRename = fs.renameSync;
    const rename = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(destination) === mappingPath) throw new Error('forced elevenlabs mapping failure');
      return originalRename(source, destination);
    });
    try {
      const result = await materializeRemoteProxyToolAssets({
        toolName: 'confirm_character_voice',
        targetDir,
        result: proxyTextResult({
          success: true,
          cleanupWarning: 'do not retry',
          remoteVoiceId: 'voice-1',
          next_step_hint:
            'Call text_to_dialogue with character_name and text. The confirmed voice mapping is reused automatically; omit reference_audio unless the user requests a one-time override.',
          mapping: { provider: 'elevenlabs', characterName: 'A', voice_id: 'voice-1' },
        }),
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.success).toBe(true);
      expect(payload.remoteVoiceId).toBe('voice-1');
      expect(payload.cleanupWarning).toBe('do not retry');
      expect(payload.localPersistenceError || payload.mappingError).toMatch(
        /elevenlabs mapping failure/i
      );
      expect(payload.next_step_hint).toBeUndefined();
    } finally {
      rename.mockRestore();
    }
  });

  test('keeps successful downloads and continues batch when registry persistence fails', async () => {
    const registryPath = path.join(targetDir, '.maker/assets/generated-assets.json');
    const originalWrite = fs.writeFileSync;
    const write = jest.spyOn(fs, 'writeFileSync').mockImplementation((filePath, data, options) => {
      if (String(filePath) === registryPath) throw new Error('forced registry failure');
      return originalWrite(filePath, data, options);
    });
    try {
      const result = await materializeRemoteProxyToolAssets({
        toolName: 'batch_sound_effects',
        targetDir,
        fetchImpl: (async (url: string) =>
          new Response(Buffer.from(url.endsWith('a') ? 'a' : 'b'), {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' },
          })) as typeof fetch,
        result: proxyTextResult({
          success: true,
          audio_files: [
            {
              kind: 'sound_effect',
              name: 'a',
              audioUrl: 'https://x.test/a',
              mimeType: 'audio/mpeg',
              format: 'mp3',
              suggestedFileName: 'a.mp3',
              targetDirectory: 'assets/audio/sfx',
            },
            {
              kind: 'sound_effect',
              name: 'b',
              audioUrl: 'https://x.test/b',
              mimeType: 'audio/mpeg',
              format: 'mp3',
              suggestedFileName: 'b.mp3',
              targetDirectory: 'assets/audio/sfx',
            },
          ],
        }),
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.audio_files).toHaveLength(2);
      expect(payload.audio_files[0].download.success).toBe(true);
      expect(payload.audio_files[0].localPath).toBe('assets/audio/sfx/a.mp3');
      expect(
        payload.audio_files[0].registryError || payload.audio_files[0].localPersistenceError
      ).toMatch(/registry failure/i);
      expect(payload.audio_files[1].download.success).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'assets/audio/sfx/b.mp3'))).toBe(true);
    } finally {
      write.mockRestore();
    }
  });

  test('rejects symlinked audio target directories that escape the project', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-audio-outside-'));
    try {
      fs.mkdirSync(path.join(targetDir, 'assets/audio'), { recursive: true });
      fs.symlinkSync(outside, path.join(targetDir, 'assets/audio/sfx'));
      const result = await materializeRemoteProxyToolAssets({
        toolName: 'text_to_sound_effect',
        targetDir,
        fetchImpl: (async () =>
          new Response(Buffer.from('bytes'), { status: 200 })) as typeof fetch,
        result: proxyTextResult({
          success: true,
          audio_files: [
            {
              kind: 'sound_effect',
              name: 'escape',
              audioUrl: 'https://x.test/escape',
              mimeType: 'audio/mpeg',
              format: 'mp3',
              suggestedFileName: 'escape.mp3',
              targetDirectory: 'assets/audio/sfx',
            },
          ],
        }),
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.audio_files[0].download.success).toBe(false);
      expect(payload.audio_files[0].download.error).toMatch(/project|symlink|outside|target/i);
      expect(fs.existsSync(path.join(outside, 'escape.mp3'))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('rejects symlinked voice mapping and registry parents without writing outside project', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-audio-metadata-outside-'));
    try {
      fs.symlinkSync(outside, path.join(targetDir, '.project'));
      const mappingResult = await materializeRemoteProxyToolAssets({
        toolName: 'confirm_character_voice',
        targetDir,
        result: proxyTextResult({
          success: true,
          mapping: { provider: 'elevenlabs', characterName: 'A', voice_id: 'voice-1' },
        }),
      });
      const mappingPayload = JSON.parse(mappingResult.content[0].text);
      expect(mappingPayload.localPersistenceError).toMatch(/outside|project/i);
      expect(fs.existsSync(path.join(outside, 'elevenlabs-voice-mapping.json'))).toBe(false);

      fs.rmSync(path.join(targetDir, '.project'), { force: true });
      fs.mkdirSync(path.join(targetDir, '.maker'), { recursive: true });
      fs.symlinkSync(outside, path.join(targetDir, '.maker/assets'));
      const registryResult = await materializeRemoteProxyToolAssets({
        toolName: 'text_to_sound_effect',
        targetDir,
        fetchImpl: (async () =>
          new Response(Buffer.from('bytes'), {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' },
          })) as typeof fetch,
        result: proxyTextResult({
          success: true,
          audio_files: [
            {
              kind: 'sound_effect',
              name: 'sfx',
              audioUrl: 'https://x.test/sfx',
              mimeType: 'audio/mpeg',
              format: 'mp3',
              suggestedFileName: 'sfx.mp3',
              targetDirectory: 'assets/audio/sfx',
            },
          ],
        }),
      });
      const registryPayload = JSON.parse(registryResult.content[0].text);
      expect(registryPayload.audio_files[0].registryError).toMatch(/outside|project/i);
      expect(fs.existsSync(path.join(outside, 'generated-assets.json'))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('does not read or overwrite an external registry file symlink', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-audio-registry-file-outside-'));
    try {
      fs.mkdirSync(path.join(targetDir, '.maker/assets'), { recursive: true });
      const outsideRegistry = path.join(outside, 'generated-assets.json');
      const sentinel = JSON.stringify({ outside: true });
      fs.writeFileSync(outsideRegistry, sentinel);
      fs.symlinkSync(outsideRegistry, path.join(targetDir, '.maker/assets/generated-assets.json'));
      const result = await materializeRemoteProxyToolAssets({
        toolName: 'text_to_sound_effect',
        targetDir,
        fetchImpl: (async () =>
          new Response(Buffer.from('bytes'), {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' },
          })) as typeof fetch,
        result: proxyTextResult({
          success: true,
          audio_files: [
            {
              kind: 'sound_effect',
              name: 'sfx',
              audioUrl: 'https://x.test/sfx',
              mimeType: 'audio/mpeg',
              format: 'mp3',
              suggestedFileName: 'sfx.mp3',
              targetDirectory: 'assets/audio/sfx',
            },
          ],
        }),
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.audio_files[0].download.success).toBe(true);
      expect(payload.audio_files[0].registryError).toMatch(/symlink|registry|project/i);
      expect(fs.readFileSync(outsideRegistry, 'utf8')).toBe(sentinel);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('does not read or write an external Doubao mapping file symlink', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-audio-mapping-file-outside-'));
    try {
      const outsideMapping = path.join(outside, 'mapping.json');
      const mappingSentinel = JSON.stringify({ outside: true });
      fs.writeFileSync(outsideMapping, mappingSentinel);
      fs.mkdirSync(path.join(targetDir, '.project'), { recursive: true });
      fs.symlinkSync(outsideMapping, path.join(targetDir, '.project/audio-voice-mapping.json'));
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
          mapping: { provider: 'doubao', characterName: 'A' },
        }),
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.referenceAudio.download.success).toBe(false);
      expect(payload.referenceAudio.download.error).toMatch(/symlink|mapping|transaction/i);
      expect(fs.readFileSync(outsideMapping, 'utf8')).toBe(mappingSentinel);
      expect(fs.existsSync(path.join(targetDir, 'assets/audio/voice-reference/a.mp3'))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('does not read or write an external Doubao reference file symlink', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-audio-reference-file-outside-'));
    try {
      const outsideReference = path.join(outside, 'reference.mp3');
      const referenceSentinel = Buffer.from('outside-reference');
      fs.writeFileSync(outsideReference, referenceSentinel);
      fs.mkdirSync(path.join(targetDir, 'assets/audio/voice-reference'), { recursive: true });
      fs.symlinkSync(outsideReference, path.join(targetDir, 'assets/audio/voice-reference/a.mp3'));
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
          mapping: { provider: 'doubao', characterName: 'A' },
        }),
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.referenceAudio.download.success).toBe(false);
      expect(payload.referenceAudio.download.error).toMatch(/symlink|reference|transaction/i);
      expect(fs.readFileSync(outsideReference)).toEqual(referenceSentinel);
      expect(fs.existsSync(path.join(targetDir, '.project/audio-voice-mapping.json'))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('does not overwrite an external ElevenLabs mapping file symlink', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-audio-eleven-file-outside-'));
    try {
      const outsideMapping = path.join(outside, 'mapping.json');
      const sentinel = JSON.stringify({ outside: true });
      fs.writeFileSync(outsideMapping, sentinel);
      fs.mkdirSync(path.join(targetDir, '.project'), { recursive: true });
      fs.symlinkSync(
        outsideMapping,
        path.join(targetDir, '.project/elevenlabs-voice-mapping.json')
      );
      const result = await materializeRemoteProxyToolAssets({
        toolName: 'confirm_character_voice',
        targetDir,
        result: proxyTextResult({
          success: true,
          mapping: { provider: 'elevenlabs', characterName: 'A', voice_id: 'voice-1' },
        }),
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.localPersistenceError).toMatch(/symlink|mapping/i);
      expect(fs.readFileSync(outsideMapping, 'utf8')).toBe(sentinel);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
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
