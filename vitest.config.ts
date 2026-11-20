import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/kernel/plugins.ts',
        'src/kernel/layerTolerances.ts',
        'src/kernel/carbonFootprint.ts',
        'src/kernel/imageToCad.ts',
        'src/kernel/ragEngine.ts',
        'src/kernel/workspacePresets.ts',
        'src/kernel/graphEngine.ts',
        'src/kernel/nurbs.ts',
        'src/kernel/curvatureOptimizer.ts',
        'src/kernel/scoobiiiVuc.ts',
        'src/kernel/componentClassifier.ts',
        'src/kernel/camRobotics.ts',
        'src/kernel/structuralFea.ts',
        'src/kernel/mcpServer.ts',
        'src/kernel/vucHash.ts',
        'src/kernel/rackFrostbiteEngine.ts',
        'src/kernel/camProcessEngine.ts',
        'src/kernel/llmBootstrap.ts',
        'src/kernel/voiceCommandParser.ts',
        'src/kernel/ecosystemErpLogistics.ts',
        'src/server/sqliteStore.ts',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
