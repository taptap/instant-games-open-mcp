import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listMakerTools } from '../maker/server/mcp';
import { saveProjectConfig } from '../maker/storage';

const AUDIO_TOOL_NAMES = [
  'text_to_music',
  'text_to_sound_effect',
  'batch_sound_effects',
  'text_to_dialogue',
  'audition_voices_for_character',
  'confirm_character_voice',
] as const;

describe('Maker audio tool descriptions', () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-audio-descriptions-'));
    saveProjectConfig(targetDir, {
      project_id: 'audio-description-project',
      user_id: 'audio-description-user',
    });
  });

  afterEach(() => fs.rmSync(targetDir, { recursive: true, force: true }));

  test('replaces remote audio manuals with precise public descriptions', async () => {
    const result = await listMakerTools({
      targetDir,
      listRemoteTools: async () =>
        AUDIO_TOOL_NAMES.map((name) => ({
          name,
          description: [
            `REMOTE MANUAL FOR ${name}`,
            'Examples:',
            'Parameters:',
            'Non-local runtime behavior.',
            'If this Maker proxy tool fails or returns isError, include remote_result.',
          ].join('\n'),
          inputSchema: {
            type: 'object',
            properties: {
              upstream_only_field: {
                type: 'string',
                description:
                  'A remote schema field that the local description override must preserve.',
              },
            },
            required: ['upstream_only_field'],
          },
        })),
    });

    for (const name of AUDIO_TOOL_NAMES) {
      const tool = result.tools.find((item) => item.name === name);
      expect(tool?.description).not.toContain('REMOTE MANUAL');
      expect(tool?.description).not.toContain('Examples:');
      expect(tool?.description).not.toContain('Parameters:');
      expect(tool?.description).not.toContain('Non-local runtime');
      expect(tool?.description).not.toContain('include remote_result');
      expect(tool?.inputSchema.properties.upstream_only_field).toMatchObject({
        type: 'string',
      });
      expect(tool?.inputSchema.required).toContain('upstream_only_field');
    }
  });

  test('keeps the decision-critical audio and local Maker workflow contracts', async () => {
    const result = await listMakerTools({
      targetDir,
      listRemoteTools: async () =>
        AUDIO_TOOL_NAMES.map((name) => ({
          name,
          description: 'Remote description replaced by the local public contract.',
          inputSchema: { type: 'object', properties: {} },
        })),
    });
    const description = (name: (typeof AUDIO_TOOL_NAMES)[number]): string =>
      result.tools.find((item) => item.name === name)?.description || '';

    expect(description('text_to_music')).toMatch(/music.{0,120}not.{0,40}sound effects/iu);
    expect(description('text_to_music')).toMatch(/wait.{0,80}50 minutes/iu);
    expect(description('text_to_music')).toMatch(/attempts to materialize.{0,100}Maker project/iu);

    expect(description('text_to_sound_effect')).toMatch(/one game sound effect/iu);
    expect(description('text_to_sound_effect')).toMatch(
      /current Seed Audio provider.{0,100}120 seconds.{0,100}does not stitch/iu
    );
    expect(description('text_to_sound_effect')).toContain('assets/audio/sfx');

    expect(description('batch_sound_effects')).toMatch(/multiple game sound effects/iu);
    expect(description('batch_sound_effects')).toMatch(/current Seed Audio provider/iu);
    expect(description('batch_sound_effects')).toMatch(/per-item failures/iu);
    expect(description('batch_sound_effects')).toContain('assets/audio/sfx');

    expect(description('text_to_dialogue')).toMatch(
      /confirmed voice mapping.{0,160}reference_audio/iu
    );
    expect(description('text_to_dialogue')).toMatch(
      /audition_voices_for_character.{0,120}confirm_character_voice/iu
    );
    expect(description('text_to_dialogue')).toMatch(
      /For Doubao,.{0,100}120 seconds.{0,100}does not stitch/iu
    );
    expect(description('text_to_dialogue')).toContain('assets/audio/voice');
    expect(description('text_to_dialogue')).not.toContain('reference_audio_path');
    expect(description('text_to_dialogue')).not.toContain('audio-voice-mapping.json');
    expect(description('text_to_dialogue')).not.toContain('elevenlabs-voice-mapping.json');

    expect(description('audition_voices_for_character')).toMatch(
      /character definition.{0,180}voice_profile\.gender.{0,80}required/iu
    );
    expect(description('audition_voices_for_character')).toMatch(
      /show every returned preview.{0,80}user.{0,40}wait/iu
    );
    expect(description('audition_voices_for_character')).toMatch(
      /temporary.{0,100}not saved as final game assets/iu
    );
    expect(description('audition_voices_for_character')).not.toContain('optional voice_profile');
    expect(description('audition_voices_for_character')).not.toContain('read_file');
    expect(description('audition_voices_for_character')).not.toContain('ARCHETYPE TEMPLATES');

    expect(description('confirm_character_voice')).toMatch(
      /only after audition_voices_for_character.{0,160}explicitly selects.{0,160}explicitly accepts/iu
    );
    expect(description('confirm_character_voice')).toMatch(/persist\w*.{0,100}text_to_dialogue/iu);
    expect(description('confirm_character_voice')).not.toMatch(/doesn.t specify/iu);
    expect(description('confirm_character_voice')).not.toContain(
      'If omitted, uses the recommended'
    );
  });
});
