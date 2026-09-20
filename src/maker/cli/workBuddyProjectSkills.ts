import { syncProjectSkills, type ProjectSkillsSyncResult } from './projectSkills.js';

export type WorkBuddyProjectSkillsSyncResult = ProjectSkillsSyncResult;

export function syncWorkBuddyProjectSkills(
  targetDir: string,
  options: { platform?: NodeJS.Platform } = {}
): WorkBuddyProjectSkillsSyncResult {
  return syncProjectSkills(targetDir, {
    ...options,
    client: '.workbuddy',
    prefix: 'taptap-maker-',
  });
}
