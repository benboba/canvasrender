/*
 * 精灵类，实现子对象管理相关功能
 */
import EventDispatcher from '../base/eventdispatcher';
import CEvent from '../event/event';
import CTouchEvent from '../event/touchevent';
import Point from '../geom/point';
import Rectangle from '../geom/rectangle';
import { IEventObject, IFn, TEmptyFn } from '../types';
import Stage from './stage';

export interface HitTestResult {
	target: Sprite | null;
}

interface Pos {
	x: number;
	y: number;
	touchX: number;
	touchY: number;
}

export interface SpriteOption {
	name?: string;
	x?: number;
	y?: number;
	alpha?: number;
	visible?: boolean;
	pointerEvents?: boolean;
	extraRender?: TEmptyFn;
	extraHitTest?: IFn<any[], HitTestResult>;
	transform?: string;
}

class Sprite extends EventDispatcher {
	constructor(option: SpriteOption = {}) {
		super();

		this._children = [];

		this.name = option.name || '';
		this.x = option.x || 0;
		this.y = option.y || 0;
		this._alpha = option.alpha || 1;
		this.visible = option.visible || true;
		this.pointerEvents = option.pointerEvents || true;
		this._extraRender = option.extraRender || null;
		this._extraHitTest = option.extraHitTest || null;
		if (option.transform) {
			this.setTransform(option.transform);
		}
		this.addEventListener(CEvent.ADDED_TO_STAGE, this.addedToStage);
	}

	protected keyReg = /x|y|name|alpha|visible|pointerEvents|parent|stage|extraRender|extraHitTest|transform/;

	private _children: Sprite[];
	get children(): Sprite[] {
		return this._children;
	}

	get numChildren(): number {
		return this.children.length;
	}

	set repaint(_r: boolean) {
		if (this.stage) {
			this.stage._repaint = _r;
		}
	}

	get depth() {
		if (this.parent === null) {
			return 0;
		} else {
			for (let d: number = this.parent!.numChildren; d--;) {
				if (this.parent!.children[d] === this) {
					return d;
				}
			}
			return 0;
		}
	}

	name: string;
	x: number;
	y: number;

	private _alpha: number;
	get alpha(): number {
		return this._alpha;
	}
	set alpha(_a: number) {
		this._alpha = Math.min(Math.max(_a, 0), 1);
	}

	visible: boolean;
	pointerEvents: boolean;
	parent?: Sprite | null;
	stage?: Stage | null;

	private _extraRender;
	get extraRender() {
		return this._extraRender;
	}
	set extraRender(_eR) {
		if (_eR === null || typeof _eR === 'function') {
			this._extraRender = _eR;
		}
	}

	private _extraHitTest;
	get extraHitTest() {
		return this._extraHitTest;
	}
	set extraHitTest(_eH) {
		if (_eH === null || typeof _eH === 'function') {
			this._extraHitTest = _eH;
		}
	}

	private _transform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
	get transform() {
		return this._transform;
	}

	attr(key: string | Record<string, string>, val: string | null = null) {
		if (typeof key === 'object') {
			for (let k in key) {
				this.attr(k, key[k]);
			}
		} else if (typeof key === 'string') {
			if (val && this.keyReg.test(key)) {
				if (key === 'transform') {
					this.setTransform(val);
				} else {
					this[key as 'name'] = val;
				}
			} else {
				if (this.keyReg.test(key)) {
					return this[key as 'name'];
				}
				return null;
			}
		}
		return this;
	}

	setTransform(newtransform: string): Sprite {
		let div = document.createElement('div');
		document.body.appendChild(div);
		div.style.transform = newtransform;

		let style = getComputedStyle(div);
		const transform = style.transform;
		document.body.removeChild(div);

		if (transform !== 'none') {
			let transtr: string[] = transform.replace(/matrix\((.+)\)/, function (...args) {
				return args[1];
			}).split(/\s*,\s*/);

			let trans: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
			for (let i: number = 0, l: number = transtr.length; i < l; i++) {
				trans[i] = parseFloat(transtr[i]);
			}

			this._transform = trans;
		}

		return this;
	}

	/*
	 * 放入场景时，处理所有子对象
	 */
	addedToStage(): void {
		const l = this.numChildren;
		const children: Sprite[] = this.children;
		const stage = this.stage;

		if (l && stage) {
			for (let i = 0; i < l; i++) {
				children[i].stage = stage;
			}
		}
	}

	/*
	 * 渲染方法，逐级传入父元素的偏移量和透明度
	 * @param x, y {Number} 偏移量
	 * @param alpha {Number} 实际透明度
	 */
	prepareRender(x: number, y: number, alpha: number): void {
		let stage = this.stage;

		// 未在场景中，或不可见，则不渲染
		if (!stage || !this.visible) return;

		x += this.x;
		y += this.y;
		alpha *= this.alpha;

		// 完全透明不渲染
		if (alpha <= 0) {
			return;
		}

		let ctx = stage.ctx;

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.translate(x, y);
		this.render();

		if (this.extraRender) {
			this.extraRender();
		}

		ctx.restore();

		/*
		 * 渲染每个子类
		 */
		for (let i: number = 0, l: number = this.numChildren; i < l; i++) {
			let child: Sprite = this.children[i];
			// 此处修正所有子对象的parent属性
			if (child.parent !== this) {
				child.parent = this;
			}
			child.prepareRender(x, y, alpha);
		}
	}

	/*
	 * 用于复写的实际渲染方法
	 */
	render(): void {}

	hitTest(point: Point, x: number = 0, y: number = 0): HitTestResult {
		if (!this.stage || !this.visible || !this.pointerEvents) return {
			target: null
		};

		x += this.x;
		y += this.y;

		// NOTE：此循环顺序不可逆，从最上面开始判断
		for (let i: number = this.numChildren; i--;) {
			let hit_test: HitTestResult = this.children[i].hitTest(point, x, y);
			if (hit_test.target !== null) {
				return hit_test;
			}
		}

		if (this.extraHitTest) {
			let extra_test: HitTestResult = this.extraHitTest(point, x, y);
			if (extra_test && extra_test.target !== null) {
				return extra_test;
			}
		}

		return {
			target: null
		};
	}

	getHitTestArea(x: number = 0, y: number = 0): Rectangle {
		let width: number = 0,
			height: number = 0;

		x += this.x;
		y += this.y;

		for (let i: number = this.numChildren; i--;) {
			let area: Rectangle = this.children[i].getHitTestArea(x, y);
			x = Math.min(x, area.x);
			y = Math.min(y, area.y);
			width = Math.max(width, area.width + area.x - x);
			height = Math.max(height, area.height + area.y - y);
		}

		return new Rectangle(x, y, width, height);
	}

	appendChild(...children: Sprite[]): Sprite {
		let depth: number = this.numChildren;
		for (let i: number = 0, l: number = children.length; i < l; i++) {
			let child: any = children[i];
			if (child instanceof Sprite) {
				this.appendChildAt(children[i], depth++);
			}
		}
		return this;
	}

	appendChildAt(el: Sprite, i: number): Sprite {
		if (!(el instanceof Stage) && !isNaN(i)) {
			if (el.parent) {
				el.parent.removeChild(el);
			}
			let l: number = this.numChildren;
			i = Math.max(0, Math.min(i, l));
			el.parent = this;
			this.children.splice(i, 0, el);

			if (el.stage !== this.stage) {
				el.stage = this.stage;
			}
			this.repaint = true;
		}
		return this;
	}

	remove(): Sprite {
		this.destroyEvent();
		this.stage = null;

		let parent = this.parent;
		if (parent) {
			parent.removeChild(this);
			this.parent = null;
		}
		this.removeChildren();
		return this;
	}

	removeChild(el: Sprite): Sprite {
		let children = this.children;
		for (let d = this.numChildren; d--;) {
			if (children[d] === el) {
				children.splice(d, 1);
				el.parent = null;
				el.stage = null;
				break;
			}
		}
		return this;
	}

	removeChildAt(i: number): Sprite {
		if (!isNaN(i) && i >= 0 && i < this.numChildren) {
			let el: Sprite = this.children.splice(i, 1)[0];
			el.parent = null;
			el.stage = null;
		}
		return this;
	}

	removeChildren(): Sprite {
		let children: Sprite[] = this.children;
		for (let d: number = this.numChildren; d--;) {
			let el: Sprite = children.splice(d, 1)[0];
			el.parent = null;
			el.stage = null;
		}
		return this;
	}

	getChildIndex(el: Sprite): number {
		if (!el || !(el instanceof Sprite) || el.parent !== this) return -1;
		for (let d: number = this.numChildren; d--;) {
			if (this.children[d] === el) {
				return d;
			}
		}
		return -1;
	}

	setChildIndex(el: Sprite, i: number): Sprite {
		if (!el || !(el instanceof Sprite) || el.parent !== this) return this;

		let _d: number = this.getChildIndex(el),
			children = this.children;
		i = Math.max(0, Math.min(i, this.numChildren));
		if (_d === i) {
			return this;
		}
		children.splice(_d, 1);
		children.splice(i, 0, el);
		return this;
	}

	/*
	 * 判断是否处于某个对象之内
	 */
	includeBy(el: Sprite): boolean {
		if (el instanceof Sprite) {
			let parent = this.parent;
			while (parent) {
				if (parent === el) {
					return true;
				}
				parent = parent.parent;
			}
		}
		return false;
	}

	/*
	 * 判断是否包含某个子对象
	 */
	include(el: Sprite): boolean {
		for (let i = 0, l = this.numChildren; i < l; i++) {
			let child = this.children[i];
			if (child === el || child.include(el)) {
				return true;
			}
		}
		return false;
	}

	getChildAt(i: number) {
		if (!isNaN(i) && i >= 0 && i < this.numChildren) {
			return this.children[i];
		}
		return null;
	}

	/*
	 * 根据名称获取对象数组
	 * @param {String} 名称
	 * 名称可带前缀：(^=name)表示以name开头，($=name)表示以name结尾，(~=name)表示包含name
	 */
	getChildrenByName(name: string): Sprite[] {
		let result: Sprite[] = [],
			prefix: string = '';

		if (/^([\^\$~])=(.+)/.test(name)) {
			prefix = RegExp.$1;
			name = RegExp.$2;
		}
		for (let d: number = this.numChildren; d--;) {
			let child: Sprite = this.children[d],
				childname: string = child.name;

			if (prefix) {
				switch (prefix) {
				case '^':
					if (childname.indexOf(name) === 0) {
						result.push(child);
					}
					break;
				case '$':
					let pos: number = childname.lastIndexOf(name);
					if (pos !== -1 && pos + name.length === childname.length) {
						result.push(child);
					}
					break;
				default:
					if (childname.indexOf(name) !== -1) {
						result.push(child);
					}
					break;
				}
			} else {
				if (childname === name) {
					result.push(child);
				}
			}
		}
		return result;
	}

	getChildrenByType(TypeClass: ClassDecorator): Sprite[] {
		let result: Sprite[] = [];
		for (let i: number = 0, l: number = this.numChildren; i < l; i++) {
			let child: Sprite = this.children[i];
			if (child instanceof TypeClass) {
				result.push(child);
			}
		}
		return result;
	}

	/*
	 * 初始化拖拽
	 */
	enableDrag(rect: Rectangle): Sprite {
		let startPos: Pos | null;
		function touchMoveHandler(this: Sprite, ev: CTouchEvent) {
			if (startPos && this.stage) {
				let x: number = startPos.x - startPos.touchX + ev.x,
					y: number = startPos.y - startPos.touchY + ev.y;

				if (rect !== null) {
					let rect_x = rect.x,
						rect_y = rect.y,
						rect_width = rect.width,
						rect_height = rect.height;

					x = Math.min(Math.max(x, rect_x), rect_x + rect_width);
					y = Math.min(Math.max(x, rect_y), rect_y + rect_height);
				}

				this.x = x;
				this.y = y;
				this.repaint = true;
			}
		}

		function touchEndHandler(this: Sprite) {
			startPos = null;
			this.removeEventListener(CTouchEvent.TOUCHMOVE, touchMoveHandler as IEventObject['callback']).removeEventListener(CTouchEvent.TOUCHEND, touchEndHandler);
		}

		this.addEventListener('touchstart', function(this: Sprite, ev: CTouchEvent) {
			if (!startPos) {
				startPos = {
					x: this.x,
					y: this.y,
					touchX: ev.x,
					touchY: ev.y
				};

				this.stage!.addEventListener(CTouchEvent.TOUCHMOVE, touchMoveHandler as IEventObject['callback']).addEventListener(CTouchEvent.TOUCHEND, touchEndHandler);
			}
		} as IEventObject['callback']);
		return this;
	}

	/*
	 * 终止
	 */
	disableDrag(): Sprite {
		this.removeEventListener('touchstart');
		return this;
	}
};

export default Sprite;
