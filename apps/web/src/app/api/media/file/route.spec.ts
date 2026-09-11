// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { getUser, download } = vi.hoisted(() => ({ getUser: vi.fn(), download: vi.fn() }));
vi.mock('../../../../lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser }, storage: { from: () => ({ download }) } }) }));
import { GET } from './route';
const request = (path = 'school/gallery/photo.png', bucket = 'tenant-media') => new Request(`https://osekola.com/api/media/file?bucket=${bucket}&path=${encodeURIComponent(path)}`);
beforeEach(() => { vi.clearAllMocks(); getUser.mockResolvedValue({ data: { user: { id: 'caller' } } }); });
describe('private media delivery', () => {
  it('rejects unknown buckets and path traversal before storage', async () => {
    expect((await GET(request('school/../secret'))).status).toBe(400);
    expect((await GET(request('school/file', 'other'))).status).toBe(400);
    expect(download).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(request())).status).toBe(401);
    expect(download).not.toHaveBeenCalled();
  });
  it('hides files rejected by Storage RLS', async () => {
    download.mockResolvedValue({ error: new Error('denied') });
    expect((await GET(request())).status).toBe(404);
  });
  it('does not cache tenant media in shared caches', async () => {
    download.mockResolvedValue({ data: new Blob(['image'], { type: 'image/png' }) });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('downloads learning documents as attachments', async () => {
    download.mockResolvedValue({ data: new Blob(['pdf'], { type: 'application/pdf' }) });
    const response = await GET(request('school/learning/teacher/lesson.pdf', 'tenant-learning'));
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="lesson.pdf"');
  });
});
