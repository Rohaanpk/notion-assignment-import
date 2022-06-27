import { NotionClient } from '../apis/notion';
import { Storage } from '../apis/storage';
import { OAuth2 } from '../apis/oauth';

import { SavedFields } from './';
import { InputFieldValidator } from './validator';
import { CONFIGURATION, SupportedTypes } from './configuration';

import { Button, Input, getElementById } from '../elements';

import { valueof } from '../types/utils';

// if an id ever changes in HTML, it must be updated here
// static type checking will then be available through ElementId
interface OptionsElements {
	restore: {
		timeZone: 'options-restore-timezone';
		canvasClassNames: 'options-restore-canvas-class-names';
		canvasClassValues: 'options-restore-canvas-class-values';
		canvasCourseCodes: 'options-restore-canvas-course-codes';
		notionPropertyNames: 'options-restore-notion-property-names';
		notionPropertyValues: 'options-restore-notion-property-values';
		notionEmojis: 'options-restore-notion-emojis';
		all: 'options-restore-all';
		undo: 'options-undo-all';
	};
	buttons: {
		oauth: 'notion-oauth';
		refreshDatabaseSelect: 'refresh-database-select';
		save: 'save-button';
	};
	elements: {
		advancedOptions: 'advanced-options';
		advancedOptionsSegmentedControl: 'display-advanced-options';
		advancedOptionsHide: 'hide-advanced-options';
		databaseSelectElement: 'database-select';
		databaseSelect: 'database-id';
	};
}

type OptionsRestoreButtonName = keyof OptionsElements['restore'];
type OptionsRestoreButtonId = valueof<OptionsElements['restore']>;
type OptionsButtonName = keyof OptionsElements['buttons'];
type OptionsButtonId = valueof<OptionsElements['buttons']>;
type OptionsElementId = OptionsRestoreButtonId | OptionsButtonId | valueof<OptionsElements['elements']>;

class RestoreDefaultsButton extends Button {
	protected static override instances: Record<string, RestoreDefaultsButton> = {};

	protected restoreKeys: (keyof SavedFields)[];
	protected inputs: Partial<Record<keyof SavedFields, Input>>;

	protected constructor(id: string, restoreKeys: (keyof SavedFields)[]) {
		super(id);

		this.restoreKeys = restoreKeys;
		this.inputs = Object.fromEntries(
			this.restoreKeys.map(key => [key, Input.getInstance(CONFIGURATION.FIELDS[key].elementId)]),
		);

		Object.values(this.inputs).forEach(input => input.addEventListener('input', this.toggle.bind(this)));
	}

	public static override getInstance<T extends string>(id: T, restoreKeys?: (keyof SavedFields)[]): RestoreDefaultsButton {
		if (!restoreKeys) throw new Error('Argument restoreKeys must be defined for class RestoreButton!');
		return RestoreDefaultsButton.instances[id] = RestoreDefaultsButton.instances[id] ?? new this(id, restoreKeys);
	}

	public toggle() {
		(Object.entries(this.inputs).some(([key, input]) => input.getValue() !== CONFIGURATION.FIELDS[<keyof SavedFields>key].defaultValue))
			? this.show()
			: this.hide();
	}

	protected async restoreInputs() {
		Object.entries(this.inputs).forEach(([key, input]) => {
			const { defaultValue } = CONFIGURATION.FIELDS[<keyof SavedFields>key];
			input.setValue(defaultValue);
		});
	}

	public async restore() {
		await this.restoreInputs();

		this.toggle();

		if (this.restoreKeys.includes('options.displayAdvanced')) {
			AdvancedOptions.dispatchInputEvent();
		}
	}
}

class RestoreSavedButton extends RestoreDefaultsButton {
	public override async toggle() {
		const savedFields = await Storage.getSavedFields();

		(Object.entries(this.inputs).some(([key, input]) => input.getValue() !== savedFields[<keyof SavedFields>key]))
			? this.show()
			: this.hide();
	}

	protected override async restoreInputs() {
		await OptionsPage.restoreOptions();

		Object.values(this.inputs).forEach(input => input.dispatchInputEvent());
	}
}

const OptionsPage = <const>{
	async validateInput(elementId: string, Validator: InputFieldValidator) {
		const inputValue = Input.getInstance(elementId).getValue() ?? null;

		// boolean values are always valid
		if (typeof inputValue === 'boolean') return inputValue;

		return await Validator.validate(inputValue);
	},

	async restoreOptions() {
		const savedFields = await Storage.getSavedFields();

		Object.entries(savedFields).forEach(([field, value]) => {
			const fieldElementId = CONFIGURATION.FIELDS[<keyof typeof savedFields>field].elementId;
			Input.getInstance(fieldElementId).setValue(value, false);
		});

		Object.values(buttons.restore).forEach(button => button.toggle());
	},

	async saveOptions() {
		const fieldEntries = await OptionsPage.getInputs();

		if (fieldEntries) {
			await Storage.setSavedFields(fieldEntries);

			buttons.save.setButtonLabel('Saved!');
			buttons.save.resetHTML(1325);

			this.restoreOptions();
		}
	},

	async getInputs(): Promise<Record<keyof SavedFields, SupportedTypes> | null> {
		const fieldEntries = Object.fromEntries(
			await Promise.all(
				Object.entries(CONFIGURATION.FIELDS).map(async ([field, { elementId, Validator }]) => {
					const validatedInput = (Validator)
						? await this.validateInput(elementId, Validator)
						: Input.getInstance(elementId).getValue();
					return [field, validatedInput];
				}),
			),
		);

		if (Object.values(fieldEntries).every(value => value !== InputFieldValidator.INVALID_INPUT)) return <Record<keyof SavedFields, SupportedTypes>>fieldEntries;

		return null;
	},
};

const AdvancedOptions = <const>{
	element: getElementById<OptionsElementId>('advanced-options'),
	control: getElementById<OptionsElementId>('display-advanced-options'),
	showInput: Input.getInstance(CONFIGURATION.FIELDS['options.displayAdvanced'].elementId),
	hideInput: Input.getInstance('hide-advanced-options'),

	show() {
		this.element?.classList.remove('hidden');
	},

	hide() {
		this.element?.classList.add('hidden');
		this.hideInput.setValue(true, false);
	},

	toggle(display: boolean) {
		(display)
			? this.show()
			: this.hide();
	},

	dispatchInputEvent() {
		this.control?.dispatchEvent(new Event('input', { bubbles: true }));
	},
};

const DatabaseSelect = <const>{
	element: getElementById<OptionsElementId>('database-select'),
	select: getElementById<OptionsElementId>('database-id'),

	show() {
		this.element?.classList.remove('hidden');
	},

	async populate(placeholder = 'Loading') {
		if (!this.select) return;

		const { accessToken } = await Storage.getNotionAuthorisation();
		if (!accessToken) return;

		this.select.innerHTML = `<option selected disabled hidden>${placeholder}...</option>`;

		const notionClient = NotionClient.getInstance({ auth: accessToken });

		const databases = await notionClient.searchShared({
			filter: {
				property: 'object',
				value: 'database',
			},
		});

		const { notion: { databaseId } } = await Storage.getOptions();

		const selectOptions = databases?.results.reduce((html: string, database) => html + `
			<option value='${database.id}' ${(databaseId === database.id) ? 'selected' : ''}>
				${NotionClient.resolveTitle(database) ?? 'Untitled'}
			</option>
			`, '');

		this.select.innerHTML = selectOptions ?? '';

		// TODO: create Select class
		this.select.dispatchEvent(new Event('input'));
	},
};

const buttons: {
	[K in OptionsButtonName]: Button;
} & {
	restore: {
		[K in OptionsRestoreButtonName]: RestoreDefaultsButton;
	};
} = <const>{
	oauth: Button.getInstance<OptionsButtonId>('notion-oauth'),
	refreshDatabaseSelect: Button.getInstance<OptionsButtonId>('refresh-database-select'),
	save: Button.getInstance<OptionsButtonId>('save-button'),
	restore: {
		timeZone: RestoreDefaultsButton.getInstance<OptionsRestoreButtonId>('options-restore-timezone',
			[
				'timeZone',
			],
		),
		canvasClassNames: RestoreDefaultsButton.getInstance<OptionsRestoreButtonId>('options-restore-canvas-class-names',
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
		canvasClassValues: RestoreDefaultsButton.getInstance<OptionsRestoreButtonId>('options-restore-canvas-class-values',
			[
				'canvas.classValues.courseCodeN',
				'canvas.classValues.notAvailable',
			],
		),
		canvasCourseCodes: RestoreDefaultsButton.getInstance<OptionsRestoreButtonId>('options-restore-canvas-course-codes',
			[
				'canvas.courseCodeOverrides',
			],
		),
		notionPropertyNames: RestoreDefaultsButton.getInstance<OptionsRestoreButtonId>('options-restore-notion-property-names',
			[
				'notion.propertyNames.name',
				'notion.propertyNames.category',
				'notion.propertyNames.course',
				'notion.propertyNames.url',
				'notion.propertyNames.available',
				'notion.propertyNames.due',
				'notion.propertyNames.span',
			],
		),
		notionPropertyValues: RestoreDefaultsButton.getInstance<OptionsRestoreButtonId>('options-restore-notion-property-values',
			[
				'notion.propertyValues.categoryCanvas',
			],
		),
		notionEmojis: RestoreDefaultsButton.getInstance<OptionsRestoreButtonId>('options-restore-notion-emojis',
			[
				'notion.courseEmojis',
			],
		),
		all: RestoreDefaultsButton.getInstance<OptionsRestoreButtonId>('options-restore-all',
			<(keyof SavedFields)[]>Object.keys(CONFIGURATION.FIELDS),
		),
		undo: RestoreSavedButton.getInstance<OptionsRestoreButtonId>('options-undo-all',
			<(keyof SavedFields)[]>Object.keys(CONFIGURATION.FIELDS),
		),
	},
};

document.addEventListener('DOMContentLoaded', async () => {
	await OptionsPage.restoreOptions();

	Object.values(buttons.restore).forEach(button => button.toggle());

	// show advanced options if appropriate
	const { options: { displayAdvanced } } = await Storage.getOptions();
	AdvancedOptions.toggle(displayAdvanced);

	// toggle dependents if appropriate
	Object.values(CONFIGURATION.FIELDS).forEach(({ elementId, dependents }) => {
		if (!dependents) return;
		Input.getInstance(elementId).toggleDependents(dependents);
	});

	const { accessToken } = await Storage.getNotionAuthorisation();

	if (!accessToken || !await NotionClient.getInstance({ auth: accessToken }).validateToken()) {
		buttons.oauth.setDefaultLabel('Authorise with Notion');
	}
	else {
		buttons.oauth.setDefaultLabel('Reauthorise with Notion');

		DatabaseSelect.populate();
		DatabaseSelect.show();
	}

	buttons.oauth.resetHTML();
});

// add event listener to advanced options toggle
AdvancedOptions.control?.addEventListener('input', () => {
	AdvancedOptions.toggle(Boolean(AdvancedOptions.showInput.getValue()));

	AdvancedOptions.showInput.dispatchInputEvent(false);
	AdvancedOptions.hideInput.dispatchInputEvent(false);
});

// validate fields on input
Object.values(CONFIGURATION.FIELDS)
	.forEach(({ elementId, Validator, validateOn = 'input', dependents = [] }) => {
		const input = Input.getInstance(elementId);

		if (Validator) {
			input.addEventListener(validateOn, () => OptionsPage.validateInput(elementId, Validator));
		}

		if (dependents.length) {
			input.addEventListener('input', () => input.toggleDependents(dependents));
		}
	});

Object.values(buttons.restore).forEach(button => button.addEventListener('click', button.restore.bind(button)));

buttons.oauth.addEventListener('click', async () => {
	buttons.oauth.setButtonLabel('Authorising with Notion...');

	const success = await OAuth2.authorise();

	if (!success) return buttons.oauth.resetHTML();

	buttons.oauth.setButtonLabel('Authorised!');
	buttons.oauth.setDefaultLabel('Reauthorise with Notion');
	buttons.oauth.resetHTML(1325);

	Storage.clearDatabaseId();
	DatabaseSelect.populate();
	DatabaseSelect.show();
});

buttons.refreshDatabaseSelect.addEventListener('click', async () => {
	buttons.refreshDatabaseSelect.setButtonLabel('Refreshing...');

	await DatabaseSelect.populate('Refreshing');

	buttons.refreshDatabaseSelect.setButtonLabel('Refreshed!');
	buttons.refreshDatabaseSelect.resetHTML(1325);
});

buttons.save.addEventListener('click', OptionsPage.saveOptions.bind(OptionsPage));

document.addEventListener('keydown', keyEvent => {
	if (keyEvent.ctrlKey && keyEvent.key === 's') {
		keyEvent.preventDefault();
		OptionsPage.saveOptions();
	}
});

const Konami = {
	pattern: <const>['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'],
	currentIndex: 0,

	handler(event: KeyboardEvent) {
		if (!(<readonly string[]>this.pattern).includes(event.key) || event.key !== this.pattern[this.currentIndex]) {
			return this.currentIndex = 0;
		}

		this.currentIndex++;

		if (this.currentIndex === this.pattern.length && AdvancedOptions.control) {
			this.currentIndex = 0;
			AdvancedOptions.showInput.setValue(true);
		}
	},
};

document.addEventListener('keydown', event => Konami.handler(event), false);