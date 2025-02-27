<template>
	<BaseWindow v-bind="$attrs" v-on="$listeners">
		<template #toolbar>
			<slot name="toolbar" v-bind:selectedTab="selected" />
		</template>

		<template #sidebar>
			<slot
				name="sidebar"
				v-if="!isMobile"
				v-bind:selectedSidebar="selected"
			/>

			<template v-for="(element, i) in sidebarItems">
				<SidebarItem
					v-if="element.type === 'item'"
					:key="`${element.text}.${i}`"
					:icon="element.icon"
					:color="element.color"
					:text="element.text"
					:isSelected="selected === element.id"
					:compact="isMobile"
					@click="onSidebarChanged(element.id)"
				/>
				<SidebarGroup
					v-else
					:key="`${element.text}.${i}.${element.isOpen}`"
					:isOpen="element.isOpen"
					:items="element.items"
					:text="element.text"
					:selected="selected"
					:compact="isMobile"
					@toggleOpen="toggleOpenCategory(element)"
					@click="onSidebarChanged"
				/>
			</template>
		</template>

		<template #default>
			<slot name="default" v-bind:selectedSidebar="selected" />
		</template>

		<template #actions>
			<slot name="actions" v-bind:selectedSidebar="selected" />
		</template>
	</BaseWindow>
</template>

<script>
import BaseWindow from './BaseWindow.vue'
import SidebarItem from './Sidebar/Item.vue'
import SidebarGroup from './Sidebar/Group.vue'

export default {
	inheritAttrs: false,
	components: {
		BaseWindow,
		SidebarItem,
		SidebarGroup,
	},
	props: {
		sidebarItems: Array,
		value: {
			type: String,
			default: undefined,
		},
	},
	computed: {
		selected() {
			return this.value
		},
		isMobile() {
			return this.$vuetify.breakpoint.mobile
		},
	},
	methods: {
		onSidebarChanged(id) {
			this.$emit('input', id)
		},
		toggleOpenCategory(element) {
			element.isOpen = !element.isOpen
		},
	},
}
</script>
