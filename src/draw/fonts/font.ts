import {Point} from '../../core/point';
import {Rect} from '../../core/rect';
import {DrawContext} from '../draw-context';

export enum FontFormat {
    FORMAT_5x7 = 0,
    FORMAT_BDF = 1,
    FORMAT_TTF = 2
}

export abstract class Font {
    protected fontReady: Promise<void>;
    protected fontLoaded: boolean = false;

    constructor(
        protected url: string,
        public name: string,
        protected options: TFontSizes,
        public format: FontFormat
    ) {
        this.fontReady = new Promise((resolve) => {
            this.loadFont().then(() => {
                resolve();
                this.fontLoaded = true;
            });
        });
    }

    abstract loadFont(): Promise<void>;
    abstract drawText(dc: DrawContext, text: string, position: Point, scaleFactor: number): Promise<void>;
    abstract getSize(dc: DrawContext, text: string): Promise<Point>;
}
