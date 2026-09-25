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

  /**
   * Paperclip, which mastodon stores every media attachment with, and its validators:
   * `validates_attachment_content_type :file, content_type: IMAGE_MIME_TYPES` names a
   * constant, which the literal-list rule could not see. mastodon was `not_applicable`.
   */
  it('finds Paperclip, and its content-type validator', async () => {
    const uploads = (await analyzeProject(fixture('paperclip-and-confirmable'))).detectors['uploads.exposure'];

    expect(uploads?.present).toBe(true);
    expect(uploads?.details?.validation).toBe(true);
  });

  it('finds a Paperclip attachment nobody checks', async () => {
    const uploads = (await analyzeProject(fixture('paperclip-unchecked'))).detectors['uploads.exposure'];

    expect(uploads?.present).toBe(true);
    expect(uploads?.details?.validation).toBe(false);
  });

  /**
   * Devise's `:confirmable` is the whole of email verification in a Devise app: the
   * mail, the token and the route come from the gem. mastodon writes it on the second
   * line of its `devise` call and was told at `high` that it verifies no addresses.
   * The same symbol in a model that does not call `devise` is a state, not a module.
   */
  it('reads Devise confirmable as email verification', async () => {
    expect((await analyzeProject(fixture('paperclip-and-confirmable'))).detectors['auth.emailVerification']?.present).toBe(true);
    expect((await analyzeProject(fixture('paperclip-unchecked'))).detectors['auth.emailVerification']?.present).toBe(false);
  });

  /** gitea's switch for the same thing: `RegisterEmailConfirm`, the words the other way round. */
  it('reads an email-confirm setting as email verification', async () => {
    expect((await analyzeProject(fixture('go-email-confirm'))).detectors['auth.emailVerification']?.present).toBe(true);
  });

  /** pocketbase's way: the standard library's `*multipart.FileHeader`, with no `FormFile` call. */
  it('finds a Go server receiving a multipart.FileHeader', async () => {
    expect((await analyzeProject(fixture('go-multipart-file-header'))).detectors['uploads.exposure']?.present).toBe(true);
  });

  /** Flask's `request.files`, lowercase: CTFd's challenge files and logos. */
  it('finds a Flask view reading request.files', async () => {
    expect((await analyzeProject(fixture('flask-request-files'))).detectors['uploads.exposure']?.present).toBe(true);
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
