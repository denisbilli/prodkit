import type { DetectorEvidence } from './types';

/**
 * What a file is called, as evidence about what the product does.
 *
 * This analyzer reads the inside of files and never the names on them. Discourse was
 * told it offers no way to export or erase personal data while shipping
 * `app/models/user_export.rb` and `app/services/user_anonymizer.rb`; supabase/auth was
 * told it has no password reset while shipping `internal/api/recover.go`. In each case
 * the concept is named most clearly in the one place nothing was looking.
 *
 * It is weaker evidence than a line and it is honest about that: the citation is the
 * file, with no line number, because a file name is not a line. It is also
 * language-neutral in a way no list of words can be — `user_export.rb`,
 * `UserExportService.java` and `export_user.py` are one pattern.
 *
 * The limit is low on purpose: a Django project has ten templates named for the
 * password reset and the reader needs to see two, not ten.
 *
 * Matched on the path with its extension removed, so a pattern never has to know
 * whether it is looking at Ruby or Go.
 */
export interface FileNameMatch {
  file: string;
}

export function searchFileNames(
  files: string[],
  patterns: RegExp[],
  limit = 4
): FileNameMatch[] {
  const matches: FileNameMatch[] = [];

  for (const file of files) {
    if (matches.length >= limit) break;
    const withoutExtension = file.replace(/\.[A-Za-z0-9]+$/, '');
    if (patterns.some((pattern) => pattern.test(withoutExtension))) {
      matches.push({ file });
    }
  }

  return matches;
}

/**
 * The evidence line for a file name.
 *
 * `type: 'file'` and no `line`, which is what distinguishes it from a snippet: the
 * reader is being pointed at a file to open, not at a line to read. The alternative —
 * claiming line 1 — is the mistake this analyzer spent a release removing.
 */
export function fileNameEvidence(matches: FileNameMatch[], claim?: string): DetectorEvidence[] {
  return matches.map((m) => ({
    type: 'file' as const,
    value: `a file named ${m.file}`,
    file: m.file,
    ...(claim ? { claim } : {}),
  }));
}
