import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoList } from './InfoList';

describe('InfoList', () => {
  it('renders label/value pairs with node values', () => {
    const { container } = render(
      <InfoList
        items={[
          { label: 'Разработчик', value: 'Студия' },
          { label: 'Совместимость', value: <span>iOS 15.0 и новее</span> },
        ]}
      />,
    );
    expect(container.querySelectorAll('dt')).toHaveLength(2);
    expect(screen.getByText('Совместимость').nextElementSibling).toHaveTextContent(
      'iOS 15.0 и новее',
    );
  });
});
