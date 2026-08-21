declare const wx: any;
declare function App(options: any): void;
declare function Page(options: any): void;
declare function Component(options: any): void;
declare function getApp(): any;
declare function require(path: string): any;

interface ArrayBufferConstructor {
  isView?(arg: unknown): boolean;
}
