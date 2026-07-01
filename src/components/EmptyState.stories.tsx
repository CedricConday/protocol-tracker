import type { Meta, StoryObj } from '@storybook/react';
import EmptyState from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  argTypes: {
    onAction: { action: 'pressed' },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    icon: '📋',
    title: 'No doses yet',
    subtitle: 'Your daily schedule will appear here once you start your day.',
  },
};

export const WithAction: Story = {
  args: {
    icon: '☀️',
    title: 'Start your day',
    subtitle: 'Tap the button below to begin today’s protocol.',
    actionLabel: 'Start My Day',
  },
};
