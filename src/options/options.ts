import browser from 'webextension-polyfill';

import { Fields, Options } from '../api-handlers/options';

import { SavedFields } from './';
import { CONFIGURATION, SupportedTypes } from './configuration';

import { Button, Input, getElementById } from '../elements';

import { valueof } from '../types/utils';

// if an id ever changes in HTML, it must be updated here
// static type checking will then be available through ElementId
interface OptionsElements {
	restore: {
		canvasClassNames: 'options-restore-canvas-class-names';
		canvasClassValues: 'options-restore-canvas-class-values';
		canvasCourseCodes: 'options-restore-canvas-course-codes';
		notionIntegration: 'options-restore-notion-integration';
		notionPropertyNames: 'options-restore-notion-property-names';
		notionPropertyValues: 'options-restore-notion-property-values';
		notionEmojis: 'options-restore-notion-emojis';
		all: 'options-restore-all';
	};
	buttons: {
		save: 'save-button';
	};
	elements: {
		advancedOptions: 'advanced-options';
	};
}

type OptionsRestoreButtonName = keyof OptionsElements['restore'];
type OptionsRestoreButtonId = valueof<OptionsElements['restore']>;
type OptionsButtonName = keyof OptionsElements['buttons'];
type OptionsButtonId = valueof<OptionsElements['buttons']>;
type OptionsElementId = OptionsRestoreButtonId | OptionsButtonId | valueof<OptionsElements['elements']>;

class RestoreButton extends Button<OptionsRestoreButtonId> {
	private restoreKeys: (keyof SavedFields)[];
	private previousValues: Partial<Record<keyof SavedFields, SupportedTypes>>;

	public constructor(id: OptionsRestoreButtonId, restoreKeys: (keyof SavedFields)[]) {
		super(id);

		this.restoreKeys = restoreKeys;
		this.previousValues = this.getPrevious();
	}

	private getPrevious(): Partial<Record<keyof SavedFields, SupportedTypes>> {
		return Object.fromEntries(
			this.restoreKeys.map(key => [key, new Input(CONFIGURATION.FIELDS[key].elementId).getValue()]),
		);
	}

	private restorePrevious() {
		this.restoreKeys.forEach(key => {
			const { elementId } = CONFIGURATION.FIELDS[key];

			const configuredValue = this.previousValues[key];
			if (configuredValue) new Input(elementId).setValue(configuredValue);
		});
	}

	private restoreDefaults() {
		this.previousValues = this.getPrevious();

		this.restoreKeys.forEach(key => {
			const { elementId, defaultValue } = CONFIGURATION.FIELDS[key];
			new Input(elementId).setValue(defaultValue);
		});
	}

	private dispatchInputEvents() {
		this.restoreKeys.forEach(key => {
			const { elementId } = CONFIGURATION.FIELDS[key];
			// TODO: create Inputs once and save
			new Input(elementId).dispatchInputEvent();
		});
	}

	public clickHandler() {
		const verifyPrompt = 'Confirm';
		const verifyPeriod = 3000;

		if (this.getLabel() !== verifyPrompt) {
			this.addClass('red');
			this.removeClass('red-hover');

			this.setLabel(verifyPrompt);

			this.restoreDefaults();

			this.setTimeout('restore', () => {
				this.restorePrevious();
				this.resetHTML(0);
			}, verifyPeriod);

			return;
		}

		this.clearTimeout('restore');

		this.dispatchInputEvents();

		this.addClass('green');
		this.removeClass('red');
		this.setLabel('Restored!');
		this.resetHTML(3500);
	}
}

const OptionsPage = {
	async restoreOptions() {
		const savedFields = await Fields.getSavedFields();

		Object.entries(savedFields).forEach(([field, value]) => {
			const fieldElementId = CONFIGURATION.FIELDS[<keyof typeof savedFields>field].elementId;
			new Input(fieldElementId).setValue(value);
		});
	},

	async saveOptions() {
		const fieldEntries = await Fields.getInputs();

		if (fieldEntries) {
			await browser.storage.local.set(fieldEntries);

			buttons.save.setLabel('Saved!');
			buttons.save.resetHTML(1325);

			this.restoreOptions();
		}
	},
};

const AdvancedOptions = {
	element: getElementById<OptionsElementId>('advanced-options'),

	show() {
		this.element?.classList.remove('hidden');
	},

	hide() {
		this.element?.classList.add('hidden');
	},

	toggle(display: boolean) {
		(display)
			? this.show()
			: this.hide();
	},
};

const buttons: {
	[K in OptionsButtonName]: Button<OptionsButtonId>;
} & {
	restore: {
		[K in OptionsRestoreButtonName]: RestoreButton;
	};
} = {
	save: new Button<OptionsButtonId>('save-button'),
	restore: {
		canvasClassNames: new RestoreButton('options-restore-canvas-class-names',
			[
				'canvas.classNames.breadcrumbs',
				'canvas.classNames.assignment',
				'canvas.classNames.title',
				'canvas.classNames.availableDate',
				'canvas.classNames.availableStatus',
				'canvas.classNames.dueDate',
				'canvas.classNames.dateElement',
			],
		),
		canvasClassValues: new RestoreButton('options-restore-canvas-class-values',
			[
				'canvas.classValues.courseCodeN',
				'canvas.classValues.notAvailable',
			],
		),
		canvasCourseCodes: new RestoreButton('options-restore-canvas-course-codes',
			[
				'canvas.courseCodeOverrides',
			],
		),
		notionIntegration: new RestoreButton('options-restore-notion-integration',
			[
				'notion.notionKey',
				'notion.databaseId',
				'timeZone',
			],
		),
		notionPropertyNames: new RestoreButton('options-restore-notion-property-names',
			[
				'notion.propertyNames.name',
				'notion.propertyNames.category',
				'notion.propertyNames.course',
				'notion.propertyNames.url',
				'notion.propertyNames.status',
				'notion.propertyNames.available',
				'notion.propertyNames.due',
				'notion.propertyNames.span',
			],
		),
		notionPropertyValues: new RestoreButton('options-restore-notion-property-values',
			[
				'notion.propertyValues.categoryCanvas',
				'notion.propertyValues.statusToDo',
			],
		),
		notionEmojis: new RestoreButton('options-restore-notion-emojis',
			[
				'notion.courseEmojis',
			],
		),
		all: new RestoreButton('options-restore-all',
			<(keyof SavedFields)[]>Object.keys(CONFIGURATION.FIELDS),
		),
	},
};

document.addEventListener('DOMContentLoaded', OptionsPage.restoreOptions);

// show advanced options if appropriate
Options.getOptions().then(({ options: { displayAdvanced } }) => AdvancedOptions.toggle(displayAdvanced));

// add event listener to advanced options toggle
const advancedOptionsControl = document.getElementById(CONFIGURATION.FIELDS['options.displayAdvanced'].elementId);
advancedOptionsControl?.parentElement?.addEventListener('input', () => AdvancedOptions.toggle((<HTMLInputElement>advancedOptionsControl)?.checked ?? false));

// validate fields on input
Object.values(CONFIGURATION.FIELDS).forEach(({ elementId, Validator, validateOn = 'input' }) => {
	if (Validator) document.getElementById(elementId)?.addEventListener(validateOn, () => Fields.validateInput(elementId, Validator));
});

Object.values(buttons.restore).forEach(button => button.addEventListener('click', () => button.clickHandler()));

buttons.save.addEventListener('click', OptionsPage.saveOptions);

document.addEventListener('keydown', keyEvent => {
	if (keyEvent.ctrlKey && keyEvent.key === 's') {
		keyEvent.preventDefault();
		OptionsPage.saveOptions();
	}
});