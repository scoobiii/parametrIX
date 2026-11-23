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
        'src/kernel/cameraTransitions.ts',
        'src/kernel/layerTolerances.ts',
        'src/kernel/carbonFootprint.ts',
        'src/kernel/imageToCad.ts',
        'src/kernel/ragEngine.ts',
        'src/kernel/workspacePresets.ts',
        'src/kernel/spurGear.ts',
        'src/kernel/graphEngine.ts',
        'src/kernel/nurbs.ts',
        'src/kernel/curvatureOptimizer.ts',
        'src/kernel/scoobiiiVuc.ts',
        'src/kernel/scoobiiiProofTelemetry.ts',
        'src/kernel/componentClassifier.ts',
        'src/kernel/camRobotics.ts',
        'src/kernel/structuralFea.ts',
        'src/kernel/mcpServer.ts',
        'src/kernel/rhinoGeometryEngine.ts',
        'src/kernel/vucHash.ts',
        'src/kernel/rackFrostbiteEngine.ts',
        'src/kernel/camProcessEngine.ts',
        'src/kernel/camAgentSystemInstruction.ts',
        'src/kernel/llmBootstrap.ts',
        'src/kernel/qwenProjectRagFinetune.ts',
        'src/kernel/voiceCommandParser.ts',
        'src/kernel/ecosystemErpLogistics.ts',
        'src/server/hermesBridge.ts',
        'src/server/oauthAuthHandler.ts',
        'src/server/projectWorkspaceManager.ts',
        'src/server/ramdiskMcpAccelerator.ts',
        'src/server/sqliteStore.ts',
        'src/server/vucFormalProof.ts',
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
