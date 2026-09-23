export class TinyWeb {
  private routes = new Map<string, (req: Request) => Response>();
  get(path: string, handler: (req: Request) => Response) { this.routes.set(path, handler); return this; }
  fetch = (req: Request) => (this.routes.get(new URL(req.url).pathname) ?? (() => new Response('Not Found', { status: 404 })))(req);
}
