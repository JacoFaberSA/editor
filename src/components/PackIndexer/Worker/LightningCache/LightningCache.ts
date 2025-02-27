import { FileType } from '/@/components/Data/FileType'
import { run } from '/@/components/Extensions/Scripts/run'
import { walkObject } from '/@/utils/walkObject'
import json5 from 'json5'
import type { PackIndexerService } from '../Main'
import type { LightningStore } from './LightningStore'
import { runScript } from './Script'
import { basename, extname } from '/@/utils/path'
import { findFileExtension } from '/@/components/FileSystem/FindFile'
import { iterateDir } from '/@/utils/iterateDir'
import {
	AnyDirectoryHandle,
	AnyFileHandle,
	AnyHandle,
} from '/@/components/FileSystem/Types'

const knownTextFiles = new Set([
	'.js',
	'.ts',
	'.lang',
	'.mcfunction',
	'.txt',
	'.molang',
	'.html',
])

export interface ILightningInstruction {
	cacheKey: string
	path: string
	pathScript?: string
	script?: string
	filter?: string[]
}

const baseIgnoreFolders = ['.bridge', 'builds', '.git', 'worlds']

export class LightningCache {
	protected folderIgnoreList = new Set<string>()
	protected totalTime = 0

	constructor(
		protected service: PackIndexerService,
		protected lightningStore: LightningStore
	) {}

	async loadIgnoreFolders() {
		try {
			const file = await this.service.fileSystem.readFile(
				'.bridge/.ignoreFolders'
			)
			;(await file.text())
				.split('\n')
				.concat(baseIgnoreFolders)
				.forEach((folder) => this.folderIgnoreList.add(folder))
		} catch {
			baseIgnoreFolders.forEach((folder) =>
				this.folderIgnoreList.add(folder)
			)
		}
	}

	async start(
		forceRefresh: boolean
	): Promise<readonly [string[], string[], string[]]> {
		await this.lightningStore.setup()

		if (this.folderIgnoreList.size === 0) await this.loadIgnoreFolders()

		if (
			!forceRefresh &&
			this.service.getOptions().noFullLightningCacheRefresh
		) {
			const filePaths = this.lightningStore.allFiles()
			if (filePaths.length > 0) return [filePaths, [], []]
		}

		let anyFileChanged = false
		const filePaths: string[] = []
		const changedFiles: string[] = []
		await this.iterateDir(
			this.service.fileSystem.baseDirectory,
			async (fileHandle, filePath) => {
				const fileDidChange = await this.processFile(
					filePath,
					fileHandle
				)

				if (fileDidChange) {
					if (!anyFileChanged) anyFileChanged = true
					changedFiles.push(filePath)
				}
				filePaths.push(filePath)

				this.service.progress.addToCurrent()
			}
		)

		let deletedFiles: string[] = []
		if (
			anyFileChanged ||
			this.lightningStore.visitedFiles !== this.lightningStore.totalFiles
		)
			deletedFiles = await this.lightningStore.saveStore()
		return [filePaths, changedFiles, deletedFiles]
	}

	async unlink(path: string) {
		let handle: AnyHandle | undefined
		try {
			handle = await this.service.fileSystem.getFileHandle(path)
		} catch {
			try {
				handle = await this.service.fileSystem.getDirectoryHandle(path)
			} catch {}
		}

		if (!handle) return
		else if (handle.kind === 'file') this.lightningStore.remove(path)
		else if (handle.kind === 'directory')
			await iterateDir(
				handle,
				(_, filePath) => this.lightningStore.remove(filePath),
				undefined,
				path
			)

		await this.lightningStore.saveStore()
	}

	protected async iterateDir(
		baseDir: AnyDirectoryHandle,
		callback: (
			file: AnyFileHandle,
			filePath: string
		) => void | Promise<void>,
		fullPath = ''
	) {
		for await (const [fileName, entry] of baseDir.entries()) {
			const currentFullPath =
				fullPath.length === 0 ? fileName : `${fullPath}/${fileName}`

			if (entry.kind === 'directory') {
				if (this.folderIgnoreList.has(currentFullPath)) continue
				await this.iterateDir(entry, callback, currentFullPath)
			} else if (fileName[0] !== '.') {
				this.service.progress.addToTotal(2)
				await callback(<AnyFileHandle>entry, currentFullPath)
			}
		}
	}

	/**
	 * @returns Whether this file did change
	 */
	async processFile(
		filePath: string,
		fileHandleOrContent: string | AnyFileHandle,
		isForeignFile = false
	) {
		const receivedContent = typeof fileHandleOrContent === 'string'

		const file = receivedContent
			? new File([fileHandleOrContent], basename(filePath))
			: await fileHandleOrContent.getFile()
		const fileType = FileType.getId(filePath)

		if (!file)
			throw new Error(
				`Invalid call to "processFile": Either fileContent or fileHandle needs to be defined!`
			)

		// First step: Check lastModified time. If the file was not modified, we can skip all processing
		// If custom fileContent is defined, we need to always run processFile
		if (
			!receivedContent &&
			file.lastModified ===
				this.lightningStore.getLastModified(filePath, fileType)
		) {
			this.lightningStore.setVisited(filePath, true, fileType)
			return false
		}
		// console.log('File changed: ' + filePath)

		const ext = extname(filePath)

		// Second step: Process file
		if (FileType.isJsonFile(filePath)) {
			await this.processJSON(
				filePath,
				fileType,
				file,
				receivedContent ? fileHandleOrContent : undefined,
				isForeignFile
			)
		} else if (knownTextFiles.has(ext)) {
			await this.processText(filePath, fileType, file, isForeignFile)
		} else {
			this.lightningStore.add(
				filePath,
				{ lastModified: file.lastModified, isForeignFile },
				fileType
			)
		}

		return true
	}

	async processText(
		filePath: string,
		fileType: string,
		file: File,
		isForeignFile?: boolean
	) {
		const instructions = await FileType.getLightningCache(filePath)

		// JavaScript cache API
		if (typeof instructions === 'string') {
			const cacheFunction = runScript(instructions)

			// Only proceed if the script returned a function
			if (typeof cacheFunction === 'function') {
				const textData = cacheFunction(await file.text())

				this.lightningStore.add(
					filePath,
					{
						lastModified: file.lastModified,
						isForeignFile,
						data:
							Object.keys(textData).length > 0
								? textData
								: undefined,
					},
					fileType
				)
			}
		}

		this.lightningStore.add(
			filePath,
			{ lastModified: file.lastModified },
			fileType
		)
	}

	/**
	 * Process a JSON file
	 * @returns Whether this json file did change
	 */
	async processJSON(
		filePath: string,
		fileType: string,
		file: File,
		fileContent?: string,
		isForeignFile?: boolean
	) {
		// Load instructions for current file
		const instructions = await FileType.getLightningCache(filePath)

		// No instructions = no work
		if (instructions.length === 0 || typeof instructions === 'string') {
			this.lightningStore.add(
				filePath,
				{
					lastModified: file.lastModified,
				},
				fileType
			)
			return
		}

		const isTemporaryUpdateCall = fileContent !== undefined
		if (fileContent === undefined) fileContent = await file.text()

		// JSON API
		let data: any
		try {
			data = json5.parse(fileContent)
		} catch (err: any) {
			// Updating auto-completions in the background shouldn't get rid of all auto-completions currently saved for this file
			if (!isTemporaryUpdateCall) {
				console.error(`[${filePath}] ${err.message}`)

				this.lightningStore.add(
					filePath,
					{
						lastModified: file.lastModified,
						isForeignFile,
					},
					fileType
				)
			}

			return
		}

		// console.log(instructions)
		const collectedData: Record<string, string[]> = {}
		const asyncOnReceiveData = (
			key: string,
			filter?: string[],
			mapFunc?: string
		) => async (data: any) => {
			let readyData: string[]
			if (Array.isArray(data)) readyData = data
			else if (typeof data === 'object')
				readyData = Object.keys(data ?? {})
			else readyData = [data]

			if (filter) readyData = readyData.filter((d) => !filter.includes(d))
			if (mapFunc)
				readyData = (
					await Promise.all(
						readyData.map((value) =>
							run({
								async: true,
								script: mapFunc,
								env: {
									Bridge: {
										value,
										withExtension: (
											basePath: string,
											extensions: string[]
										) =>
											findFileExtension(
												this.service.fileSystem,
												basePath,
												extensions
											),
									},
								},
							})
						)
					)
				).filter((value) => value !== undefined)

			if (!collectedData[key]) collectedData[key] = readyData
			else
				collectedData[key] = [
					...new Set(collectedData[key].concat(readyData)),
				]
		}
		const promises: Promise<unknown>[] = []
		const onReceiveData = (
			key: string,
			filter?: string[],
			mapFunc?: string
		) => (data: any) => {
			promises.push(asyncOnReceiveData(key, filter, mapFunc)(data))
		}

		for (const instruction of instructions) {
			const key = instruction.cacheKey
			if (!key) continue
			let paths = Array.isArray(instruction.path)
				? instruction.path
				: [instruction.path]
			const generatePaths = instruction.pathScript

			if (generatePaths) {
				paths = run({
					script: generatePaths,
					env: { Bridge: { paths } },
				})

				if (!Array.isArray(paths) || paths.length === 0) return
			}

			for (const path of paths) {
				walkObject(
					path,
					data,
					onReceiveData(key, instruction.filter, instruction.script)
				)
			}
		}

		await Promise.all(promises)
		this.lightningStore.add(
			filePath,
			{
				lastModified: file.lastModified,
				isForeignFile,
				data:
					Object.keys(collectedData).length > 0
						? collectedData
						: undefined,
			},
			fileType
		)

		return
	}
}
