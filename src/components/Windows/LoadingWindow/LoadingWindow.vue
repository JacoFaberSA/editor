<template>
	<BaseWindow
		:windowTitle="$data.message || 'windows.loadingWindow.titles.loading'"
		:isVisible="isVisible"
		:hasMaximizeButton="false"
		:hasCloseButton="false"
		:isPersistent="true"
		:isFullscreen="false"
		:width="300"
		:height="40"
		@closeWindow="onClose"
		:isSmallPopup="true"
	>
		<template #default>
			<v-progress-linear indeterminate />
		</template>
	</BaseWindow>
</template>

<script>
import BaseWindow from '/@/components/Windows/Layout/BaseWindow.vue'

export default {
	name: 'LoadingWindow',
	components: {
		BaseWindow,
	},
	props: ['currentWindow'],
	data() {
		return this.currentWindow
	},
	methods: {
		onClose() {
			this.currentWindow.close()
		},
	},
}
</script>
