import type { StorybookConfig } from '@storybook/react-native-web-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-native-web-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
};

export default config;
