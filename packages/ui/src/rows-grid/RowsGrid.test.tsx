import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRow } from '../app-row/AppRow';
import { RowsGrid } from './RowsGrid';

describe('RowsGrid', () => {
  it('groups rows into columns of 3 inside a rail', () => {
    render(
      <RowsGrid label="Самый загружаемый">
        {['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => (
          <AppRow key={id} href={`/app/${id}`} name={`Приложение ${i + 1}`} />
        ))}
      </RowsGrid>,
    );
    const rail = screen.getByRole('list', { name: 'Самый загружаемый' });
    const columns = rail.querySelectorAll(':scope > li');
    expect(columns).toHaveLength(3);
    expect(within(columns[0] as HTMLElement).getAllByRole('link')).toHaveLength(3);
    expect(within(columns[2] as HTMLElement).getAllByRole('link')).toHaveLength(1);
  });
});
