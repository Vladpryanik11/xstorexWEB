import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CertificateUpload } from './CertificateUpload';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  refresh.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const file = (name: string, bytes: number[] | number) =>
  new File([typeof bytes === 'number' ? new Uint8Array(bytes) : new Uint8Array(bytes)], name);

function fill(p12 = file('cert.p12', [1, 2, 3]), profile = file('a.mobileprovision', [4, 5, 6])) {
  fireEvent.change(screen.getByLabelText('Файл .p12'), { target: { files: [p12] } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: ' пароль ' } });
  fireEvent.change(screen.getByLabelText('Файл .mobileprovision'), {
    target: { files: [profile] },
  });
}

describe('CertificateUpload', () => {
  it('upload is disabled until both files are chosen', () => {
    render(<CertificateUpload deviceId="d1" />);
    expect(screen.getByRole('button', { name: 'Загрузить' })).toBeDisabled();
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('autocomplete', 'off');
  });

  it('sends base64 files and the password verbatim, then says the buyer got a letter', async () => {
    fetchMock.mockResolvedValue(json({ id: 'd1' }, 201));
    render(<CertificateUpload deviceId="d1" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Сертификат загружен, покупателю отправлено письмо',
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/devices/d1/certificate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      p12: 'AQID',
      password: ' пароль ',
      profile: 'BAUG',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the server refusal above the form', async () => {
    fetchMock.mockResolvedValue(
      json({ code: 'UDID_NOT_IN_PROFILE', message: 'В профиле нет этого iPhone' }, 422),
    );
    render(<CertificateUpload deviceId="d1" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('В профиле нет этого iPhone');
  });

  it('refuses a file over the limit before sending', async () => {
    render(<CertificateUpload deviceId="d1" />);
    fill(file('big.p12', 51 * 1024));
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Файл слишком большой');
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
