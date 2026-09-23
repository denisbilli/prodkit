import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A product that accepts a file, in the words of the framework that receives it.
 *
 * Presence was a Node or Python package — multer, formidable, an S3 client — or a route
 * serving `/uploads`. `chatwoot/chatwoot` stores every conversation attachment through
 * Active Storage and checks each one's type against a list; open-webui takes documents
 * through FastAPI's `UploadFile`. Both were `not_applicable`, as if neither took files.
 */
describe('the framework that receives the file', () => {
  it('finds Active Storage, and the type check on the server', async () => {
    const analysis = await analyzeProject(fixture('active-storage-attachments'));
    const uploads = analysis.detectors['uploads.exposure'];

    expect(uploads?.present).toBe(true);
    // `ACCEPTABLE_FILE_TYPES.include?(file.content_type)` — not a client-side list.
    expect(uploads?.details?.validation).toBe(true);
  });

  it('finds a Go handler reading a multipart file, and no check on it', async () => {
    const analysis = await analyzeProject(fixture('go-form-file'));
    const uploads = analysis.detectors['uploads.exposure'];

    expect(uploads?.present).toBe(true);
    expect(uploads?.details?.validation).toBe(false);
  });

  /**
   * gotify reads the first bytes and asks `filetype.IsImage(head)` before it saves an
   * image; that is a check of the content, not of the name the client sent.
   */
  it('counts a Go handler that sniffs the content', async () => {
    const analysis = await analyzeProject(fixture('go-form-file-sniffed'));

    expect(analysis.detectors['uploads.exposure']?.details?.validation).toBe(true);
  });

  /** LiveView enforces what `allow_upload` was told to accept, and how large. */
  it('finds a LiveView upload and what it accepts', async () => {
    const analysis = await analyzeProject(fixture('liveview-accepts-csv'));
    const uploads = analysis.detectors['uploads.exposure'];

    expect(uploads?.present).toBe(true);
    expect(uploads?.details?.validation).toBe(true);
  });

  /**
   * antd calls its file-picker type `UploadFile`, the same word FastAPI uses for a file
   * the server received. A component holding one is a form; the Python spelling is only
   * read from Python.
   */
  it('is not a file picker in a React component', async () => {
    const analysis = await analyzeProject(fixture('a-file-picker-is-not-a-server'));

    expect(analysis.detectors['uploads.exposure']?.present).toBe(false);
    // react-dropzone's `accept:` is a browser being asked nicely; only Elixir's counts.
    expect(analysis.detectors['uploads.exposure']?.details?.validation).toBe(false);
  });
});
