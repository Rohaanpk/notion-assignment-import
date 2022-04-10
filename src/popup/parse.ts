import { parseDate } from 'chrono-node';
import { EmojiRequest } from '../api-handlers/notion';

export interface ParsedAssignment {
	name: string;
	course: string;
	icon: EmojiRequest | null;
	url: string;
	available: string;
	due: string;
}

export interface SavedAssignments {
	[course: string]: ParsedAssignment[];
}

(async function parseAssignments(): Promise<void> {
	const classSelector = (className: string): string => `.${className}`;

	const options = await chrome.storage.local.get({
		'timezone': 'Pacific/Auckland',
		'canvas.classNames.breadcrumbs': 'ic-app-crumbs',
		'canvas.classNames.assignment': 'assignment',
		'canvas.classNames.title': 'ig-title',
		'canvas.classNames.availableDate': 'assignment-date-available',
		'canvas.classNames.availableStatus': 'status-description',
		'canvas.classNames.dueDate': 'assignment-date-due',
		'canvas.classNames.dateElement': 'screenreader-only',
		'canvas.classValues.courseCodeN': 2,
		'canvas.classValues.notAvailable': 'Not available until',
		'canvas.courseCodeOverrides': '{}',
		'notion.courseEmojis': '{}',
	});

	const CONSTANTS = {
		TIMEZONE: options['timezone'],
		CLASSES: {
			BREADCRUMBS: options['canvas.classNames.breadcrumbs'],
			ASSIGNMENT: options['canvas.classNames.assignment'],
			TITLE: options['canvas.classNames.title'],
			AVAILABLE_DATE: options['canvas.classNames.availableDate'],
			AVAILABLE_STATUS: options['canvas.classNames.availableStatus'],
			DUE_DATE: options['canvas.classNames.dueDate'],
			SCREENREADER_ONLY: options['canvas.classNames.dateElement'],
		},
		SELECTORS: {
			get COURSE_CODE() { return `${classSelector(CONSTANTS.CLASSES.BREADCRUMBS)} li:nth-of-type(${CONSTANTS.VALUES.COURSE_CODE_N}) span`; },
			get AVAILABLE_STATUS() { return `${classSelector(CONSTANTS.CLASSES.AVAILABLE_DATE)} ${classSelector(CONSTANTS.CLASSES.AVAILABLE_STATUS)}`; },
			get AVAILABLE_DATE() { return `${classSelector(CONSTANTS.CLASSES.AVAILABLE_DATE)} ${classSelector(CONSTANTS.CLASSES.SCREENREADER_ONLY)}`; },
			get DUE_DATE() { return `${classSelector(CONSTANTS.CLASSES.DUE_DATE)} ${classSelector(CONSTANTS.CLASSES.SCREENREADER_ONLY)}`; },
		},
		VALUES: {
			COURSE_CODE_N: options['canvas.classValues.courseCodeN'],
			NOT_AVAILABLE_STATUS: options['canvas.classValues.notAvailable'],
		},
	};

	class CanvasAssignment {
		public static courseCodeOverrides = CanvasAssignment.parseOption(options['canvas.courseCodeOverrides'], 'Canvas Course Code Overrides');
		public static courseEmojis = CanvasAssignment.parseOption(options['notion.courseEmojis'], 'Notion Course Emojis');

		private static validSelectors = new Set();
		private static invalidSelectors = new Set();

		private valid = true;
		private assignment: NonNullable<ReturnType<Element['querySelector']>>;

		// if name, url, or due is '', !isValid()
		private name: string | '';
		private course: string;
		private icon: EmojiRequest | null;
		private url: string | '';
		private available: string;
		private due: string | '';

		private static parseOption(text: string, option: string): ReturnType<typeof JSON.parse> | Record<string, never> {
			try {
				return JSON.parse(text);
			}

			catch {
				alert(`The configured string for the ${option} option is not valid JSON.\n\nPlease verify this is a valid JSON object.\n\nCurrent configuration: \n${text}`);
				return {};
			}
		}

		private static querySelector(parent: ParentNode, selector: string, verifySelector = true): NonNullable<ReturnType<Element['querySelector']>> | void {
			const element = parent.querySelector(selector);

			if (element) {
				CanvasAssignment.validSelectors.add(selector);
				return element;
			}

			else if (verifySelector && !CanvasAssignment.validSelectors.has(selector) && !CanvasAssignment.invalidSelectors.has(selector)) {
				CanvasAssignment.invalidSelectors.add(selector);
				alert(`Incorrect selector: ${selector}`);
			}
		}

		private static getNextHour(): string {
			function roundToNextHour(date: Date): Date {
				if (date.getMinutes() === 0) return date;

				date.setHours(date.getHours() + 1, 0, 0, 0);

				return date;
			}

			return roundToNextHour(new Date()).toLocaleString('en-US', { timeZone: CONSTANTS.TIMEZONE ?? undefined });
		}

		public constructor(assignment: NonNullable<ReturnType<Element['querySelector']>>) {
			this.assignment = assignment;

			this.name = this.parseName();
			this.course = this.parseCourse();
			this.icon = this.queryIcon();
			this.url = this.parseURL();
			this.available = this.parseAvailable();
			this.due = this.parseDue();
		}

		public isValid(): boolean {
			return this.valid;
		}

		public getCourse(): string | 'Unknown Course Code' {
			return `${(this.icon) ? `${this.icon} ` : ''}${this.course}`;
		}

		public toAssignment(): ParsedAssignment {
			return {
				name: this.name,
				course: this.course,
				icon: this.icon,
				url: this.url,
				available: this.available,
				due: this.due,
			};
		}

		private setInvalid() {
			this.valid = false;
		}

		private queryRequired(selector: string, verifySelector = true): void | Element {
			const element = CanvasAssignment.querySelector(this.assignment, selector, verifySelector);
			if (!element?.textContent) return this.setInvalid();
			return element;
		}

		private parseTitle(): void | HTMLAnchorElement {
			const title = this.queryRequired(classSelector(CONSTANTS.CLASSES.TITLE));
			return <HTMLAnchorElement>title;
		}

		private parseName(): string | '' {
			return this.parseTitle()?.textContent?.trim() ?? '';
		}

		private parseCourse(): string | 'Unknown Course Code' {
			const parsedCourseCode = CanvasAssignment.querySelector(document, CONSTANTS.SELECTORS.COURSE_CODE)?.innerHTML ?? 'Unknown Course Code';

			return CanvasAssignment.courseCodeOverrides?.[parsedCourseCode] ?? parsedCourseCode;
		}

		private queryIcon(): EmojiRequest | null {
			return CanvasAssignment.courseEmojis?.[this.course] ?? null;
		}

		private parseURL(): string | '' {
			return this.parseTitle()?.href ?? '';
		}

		private parseAvailable(): string {
			const availableStatus = CanvasAssignment.querySelector(this.assignment, CONSTANTS.SELECTORS.AVAILABLE_STATUS, false);
			const availableDate = CanvasAssignment.querySelector(this.assignment, CONSTANTS.SELECTORS.AVAILABLE_DATE, false);

			// If the AVAILABLE_STATUS class actually contains the 'available until' date, return an empty string
			const availableString = (availableStatus?.textContent?.trim() !== CONSTANTS.VALUES.NOT_AVAILABLE_STATUS)
				? CanvasAssignment.getNextHour()
				: availableDate?.textContent?.trim() ?? CanvasAssignment.getNextHour();

			return parseDate(availableString, { timezone: CONSTANTS.TIMEZONE ?? undefined }).toISOString();
		}

		private parseDue(): string | '' {
			const dueString = this.queryRequired(CONSTANTS.SELECTORS.DUE_DATE, false)?.textContent?.trim();

			if (dueString) {
				const dueDate = parseDate(dueString, { timezone: CONSTANTS.TIMEZONE ?? undefined });

				if (dueDate.valueOf() > Date.now()) return dueDate.toISOString();
				else this.setInvalid();
			}

			// if due date was unable to be parsed, or if the due date is in the past, return ''
			return '';
		}
	}

	const assignments = document.getElementsByClassName(CONSTANTS.CLASSES.ASSIGNMENT);

	if (!assignments.length) return alert('No Canvas assignments were found on this page.\n\nPlease ensure this is a valid Canvas Course Assignments page.\n\nIf this is a Canvas Assignments page, the configured Canvas Class Names options may be incorrect.');

	const canvasAssignments = Object.values(assignments)
		.map(assignment => new CanvasAssignment(assignment))
		.filter(assignment => assignment.isValid());

	if (canvasAssignments.length) {
		const { savedAssignments } = <{ savedAssignments: SavedAssignments; }>await chrome.storage.local.get({ savedAssignments: {} });

		savedAssignments[canvasAssignments[0].getCourse()] = canvasAssignments.map(assignment => assignment.toAssignment());

		await chrome.storage.local.set({
			savedAssignments,
			savedCourse: canvasAssignments[0].getCourse(),
		});
	}

	else {
		alert('No valid assignments were found on this page.\n\nNOTE: Assignments without due dates are treated as invalid.');

		await chrome.storage.local.set({
			savedCourse: '',
		});
	}
})();