import { getElementById } from '.';

export class Button<T extends string> {
	private button: HTMLButtonElement;
	private label: HTMLElement;

	private defaultHtml: string;
	private defaultClassList: string;

	private timeouts: Record<string, NodeJS.Timeout> = {};

	public constructor(id: T) {
		const element = getElementById<T>(id);

		if (!element || !(element instanceof HTMLButtonElement)) throw new Error(`Invalid button identifier ${id}!`);

		this.button = element;
		this.label = element.querySelector('.button-label') ?? element;

		this.defaultHtml = element.innerHTML;
		this.defaultClassList = element.classList.value;
	}

	public getLabel() {
		return this.label.innerHTML;
	}

	public setLabel(html: string) {
		this.label.innerHTML = html;
	}

	public resetHTML(delay?: number) {
		const reset = () => {
			this.setLabel(this.defaultHtml);
			this.button.classList.value = this.defaultClassList;
		};

		if (!delay) return reset();
		this.setTimeout('resetHTML', reset, delay);
	}

	public addClass(className: string) {
		this.button.classList.add(className);
	}

	public removeClass(className: string) {
		this.button.classList.remove(className);
	}

	public show() {
		this.removeClass('hidden');
	}

	public hide() {
		this.addClass('hidden');
	}

	public disable() {
		this.button.disabled = true;
	}

	public enable() {
		this.button.disabled = false;
	}

	public addEventListener(...args: Parameters<typeof HTMLElement.prototype.addEventListener>) {
		this.button.addEventListener(...args);
	}

	public setTimeout(name: string, timeout: () => void, delay: number) {
		clearTimeout(this.timeouts[name]);
		this.timeouts[name] = setTimeout(timeout, delay);
	}

	public clearTimeout(name: string) {
		clearTimeout(this.timeouts[name]);
	}
}