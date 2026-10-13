import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SuccessMark } from './SuccessMark';

describe('SuccessMark', () => {
  it('renders a check glyph', () => {
    const { container } = render(<SuccessMark />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
