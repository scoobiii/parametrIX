declare module 'occt-import-js' {
  interface OcctMesh {
    name?: string;
    color?: [number, number, number];
    attributes: {
      position: { array: number[] };
      normal?: { array: number[] };
    };
    index?: { array: number[] };
    brep_faces?: { first: number; last: number; color?: [number, number, number] }[];
  }

  interface OcctNode {
    name?: string;
    meshes?: number[];
    children?: OcctNode[];
  }

  interface OcctReadResult {
    success: boolean;
    root?: OcctNode;
    meshes?: OcctMesh[];
  }

  interface OcctModule {
    ReadStepFile(fileContent: Uint8Array, params?: Record<string, unknown>): OcctReadResult;
    ReadIgesFile(fileContent: Uint8Array, params?: Record<string, unknown>): OcctReadResult;
    ReadBrepFile(fileContent: Uint8Array, params?: Record<string, unknown>): OcctReadResult;
  }

  export default function initOpenCascade(): Promise<OcctModule>;
}
