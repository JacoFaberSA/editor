import { IKeyBindingConfig } from './KeyBinding'
import { EventDispatcher } from '/@/components/Common/Event/EventDispatcher'
import { v4 as uuid } from 'uuid'

export interface IActionConfig {
	type?: 'action'
	id?: string
	icon?: string
	name?: string
	color?: string
	description?: string
	isDisabled?: (() => boolean) | boolean
	keyBinding?: string | string[]
	prevent?: IKeyBindingConfig['prevent']
	onTrigger: () => Promise<unknown> | unknown
}

export class SimpleAction extends EventDispatcher<void> {
	id: string

	constructor(protected config: IActionConfig) {
		super()
		this.id = config.id ?? uuid()
	}

	//#region GETTERS
	get name() {
		return this.config.name
	}
	get icon() {
		return this.config.icon
	}
	get description() {
		return this.config.description
	}
	get color() {
		return this.config.color
	}
	get isDisabled() {
		if (typeof this.config.isDisabled === 'function')
			return this.config.isDisabled?.() ?? false
		return this.config.isDisabled ?? false
	}
	//#endregion

	async trigger() {
		if (this.isDisabled) return
		this.dispatch()
		return await this.config.onTrigger()
	}
}
