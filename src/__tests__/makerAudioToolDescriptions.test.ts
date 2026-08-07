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

    expect(description('text_to_sound_effect')).toMatch(/Doubao Seed Audio/iu);
    expect(description('text_to_sound_effect')).toMatch(/120 seconds.{0,100}does not stitch/iu);
    expect(description('text_to_sound_effect')).toContain('assets/audio/sfx');

    expect(description('batch_sound_effects')).toMatch(
      /multiple game sound effects.{0,100}Doubao Seed Audio/iu
    );
    expect(description('batch_sound_effects')).toMatch(/per-item failures/iu);
    expect(description('batch_sound_effects')).toContain('assets/audio/sfx');

    expect(description('text_to_dialogue')).toMatch(/ElevenLabs.{0,120}voice mapping/iu);
    expect(description('text_to_dialogue')).toMatch(/stability.{0,80}0\.5/iu);
    expect(description('text_to_dialogue')).toContain('Eleven v3');
    expect(description('text_to_dialogue')).toMatch(
      /audition_voices_for_character.{0,120}confirm_character_voice/iu
    );
    expect(description('text_to_dialogue')).toContain('assets/audio/voice');
    expect(description('text_to_dialogue')).toContain('elevenlabs-voice-mapping.json');
    expect(description('text_to_dialogue')).not.toContain('reference_audio_path');

    expect(description('audition_voices_for_character')).toMatch(/ElevenLabs Voice Design/iu);
    expect(description('audition_voices_for_character')).toMatch(
      /candidate_count.{0,80}1.{0,20}3/iu
    );
    expect(description('audition_voices_for_character')).toMatch(/at least 100 characters/iu);
    expect(description('audition_voices_for_character')).toMatch(
      /show every returned preview.{0,80}user.{0,40}wait/iu
    );
    expect(description('audition_voices_for_character')).toMatch(
      /temporary.{0,100}not saved as final game assets/iu
    );
    expect(description('audition_voices_for_character')).not.toContain('voice_profile.gender');
    expect(description('audition_voices_for_character')).not.toContain('read_file');
    expect(description('audition_voices_for_character')).not.toContain('ARCHETYPE TEMPLATES');

    expect(description('confirm_character_voice')).toMatch(
      /only after audition_voices_for_character.{0,160}explicitly selects.{0,160}explicitly accepts/iu
    );
    expect(description('confirm_character_voice')).toMatch(/persist\w*.{0,100}text_to_dialogue/iu);
    expect(description('confirm_character_voice')).toMatch(/ElevenLabs.{0,120}Voice Slot/iu);
    expect(description('confirm_character_voice')).not.toMatch(/doesn.t specify/iu);
    expect(description('confirm_character_voice')).not.toContain(
      'If omitted, uses the recommended'
    );
  });

  test('uses fixed per-tool descriptions without changing the authoritative remote schema', async () => {
    const result = await listMakerTools({
      targetDir,
      listRemoteTools: async () =>
        AUDIO_TOOL_NAMES.map((name) => ({
          name,
          description: 'Remote description',
          inputSchema:
            name === 'audition_voices_for_character'
              ? {
                  type: 'object',
                  properties: {
                    character_name: { type: 'string' },
                    character_description: { type: 'string' },
                    audition_line: { type: 'string' },
                    voice_profile: { type: 'object', properties: {} },
                  },
                  required: ['character_name', 'character_description', 'audition_line'],
                }
              : name === 'text_to_dialogue'
                ? {
                    type: 'object',
                    properties: {
                      inputs: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            character_name: { type: 'string' },
                            text: { type: 'string' },
                            reference_audio: { type: 'string' },
                            delivery_instruction: { type: 'string' },
                          },
                        },
                      },
                    },
                    required: ['inputs'],
                  }
                : {
                    type: 'object',
                    properties: {
                      duration_seconds: { type: 'number', maximum: 120 },
                    },
                  },
        })),
    });

    const dialogue = result.tools.find((tool) => tool.name === 'text_to_dialogue');
    const audition = result.tools.find((tool) => tool.name === 'audition_voices_for_character');
    expect(dialogue?.description).toContain('ElevenLabs');
    expect(dialogue?.inputSchema.properties.inputs.items.properties.reference_audio).toBeDefined();
    expect(audition?.inputSchema.required).toContain('voice_profile');
    expect(audition?.description).toContain('ElevenLabs Voice Design');
  });

  test('does not inject Doubao-only fields into an ElevenLabs schema', async () => {
    const result = await listMakerTools({
      targetDir,
      listRemoteTools: async () => [
        {
          name: 'text_to_sound_effect',
          description: 'Remote ElevenLabs sound effect',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              duration_seconds: { type: 'number', minimum: 0.5, maximum: 30 },
              prompt_influence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['text'],
          },
        },
        {
          name: 'text_to_dialogue',
          description: 'Remote ElevenLabs dialogue',
          inputSchema: {
            type: 'object',
            properties: {
              inputs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    character_name: { type: 'string' },
                    text: { type: 'string' },
                  },
                },
              },
              stability: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['inputs'],
          },
        },
        {
          name: 'audition_voices_for_character',
          description: 'Remote ElevenLabs audition',
          inputSchema: {
            type: 'object',
            properties: {
              character_name: { type: 'string' },
              character_description: { type: 'string' },
              audition_line: { type: 'string', minLength: 100 },
              candidate_count: { type: 'integer', minimum: 1, maximum: 3 },
            },
            required: ['character_name', 'character_description', 'audition_line'],
          },
        },
      ],
    });

    const dialogue = result.tools.find((tool) => tool.name === 'text_to_dialogue');
    const audition = result.tools.find((tool) => tool.name === 'audition_voices_for_character');
    expect(dialogue?.inputSchema.properties.inputs.items.properties).not.toHaveProperty(
      'reference_audio'
    );
    expect(dialogue?.inputSchema.properties.inputs.items.properties).not.toHaveProperty(
      'delivery_instruction'
    );
    expect(audition?.inputSchema.properties).not.toHaveProperty('voice_profile');
    expect(audition?.inputSchema.required).not.toContain('voice_profile');
  });
});
