/**
 * Type declarations for pdfjs-dist-legacy
 * This is an alias for pdfjs-dist@2.16.105
 */

declare module 'pdfjs-dist-legacy' {
    export * from 'pdfjs-dist';
}

declare module 'pdfjs-dist-legacy/lib/display/svg' {
    export class SVGGraphics {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(commonObjs: any, objs: any);
        embedFonts: boolean;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getSVG(operatorList: any, viewport: any): Promise<SVGElement>;
    }
}
