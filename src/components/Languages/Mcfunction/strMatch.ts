/**
 * A function that returns whether string a matches string b fully or partially.
 */
export function strMatch(a: string, b: string) {
	if (a === b) return 'full'
	else if (a.includes(b)) return 'partial'
	else return 'none'
}

/**
 * A function that returns whether string a matches string array b fully or partially.
 */
export function strMatchArray(a: string, b: string[]) {
	if (b.includes(a)) return 'full'
	else if (b.some((x) => x.includes(a))) return 'partial'
	else return 'none'
}
