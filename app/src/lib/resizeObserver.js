export function resizeObserver(node, callback) {
	const observer = new ResizeObserver((entries) => {
		for (const entry of entries) {
			const box = entry.contentRect;
			callback({ width: Math.round(box.width), height: Math.round(box.height) });
		}
	});

	observer.observe(node);
	return {
		destroy() {
			observer.disconnect();
		}
	};
}

