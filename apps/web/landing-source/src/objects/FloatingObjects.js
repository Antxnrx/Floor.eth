import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import createAsciiMaterial from "../materials/AsciiMaterial";

export default class FloatingObjects extends THREE.Group {
	constructor({
		size = 0.8,
		color = new THREE.Color(0xbfe3ff),
		spinSpeed = 1.25,
		floatSpeed = 1.5,
		floatAmplitude = 0.2,
		morphHold = 3,
		morphDuration = 0.75,
		glowIntensity = 1.2,
		glowDistance = 8,
		cellSize = 10,
	} = {}) {
		super();

		this.cellSize = cellSize;

		this.spinSpeed = spinSpeed;
		this.floatSpeed = floatSpeed;
		this.floatAmplitude = floatAmplitude;
		this.baseY = 0;

		this.morphHold = morphHold;
		this.morphDuration = morphDuration;
		this.cycleIndex = -1;

		const sources = [
			this.#createBlockGeometry(size, 0.015),
			this.#createBlockGeometry(size, 0.28),
		];
		const nonIndexed = sources.map((g) => (g.index ? g.toNonIndexed() : g));
		const maxCount = Math.max(
			...nonIndexed.map((g) => g.getAttribute("position").count),
		);
		this.shapes = nonIndexed.map((g) => this.#padToCount(g, maxCount));
		sources.forEach((g) => g.dispose());
		nonIndexed.forEach((g) => g.dispose());

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(this.shapes[0].positions.slice(), 3),
		);
		geometry.setAttribute(
			"normal",
			new THREE.BufferAttribute(this.shapes[0].normals.slice(), 3),
		);
		geometry.setAttribute(
			"aTargetPosition",
			new THREE.BufferAttribute(this.shapes[1].positions.slice(), 3),
		);
		geometry.setAttribute(
			"aTargetNormal",
			new THREE.BufferAttribute(this.shapes[1].normals.slice(), 3),
		);

		geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), size * 2);

		this.mesh = new THREE.Mesh(
			geometry,
			createAsciiMaterial({ color: new THREE.Color(color), cellSize }),
		);

		this.mesh.castShadow = false;
		this.add(this.mesh);

		this.glowIntensity = glowIntensity;
		this.glow = new THREE.PointLight(color, glowIntensity, glowDistance, 2);
		this.add(this.glow);
	}

	/*
	 * A 2x2x2 lattice of cubes: one block made of eight.
	 *
	 * `gap` is the fraction of each cell left empty. Near 0 the eight cubes
	 * meet face to face and read as a single solid block; at ~0.3 they pull
	 * apart into a visible lattice. Cube edge and centre offset move by the
	 * same amount in opposite directions, so the outer bounding box is the
	 * same at any gap — the block opens up rather than growing.
	 *
	 * Both morph targets come from this one function with the same loop order,
	 * so vertex i of the solid block is the matching corner of vertex i of the
	 * lattice. That is what makes the morph read as eight blocks separating
	 * instead of a scramble, and it keeps the two vertex counts equal so
	 * #padToCount has nothing to pad.
	 *
	 * The solid shape uses a hairline gap rather than exactly 0 so adjacent
	 * interior faces never land on the same plane. The ASCII material is
	 * double-sided and transparent, so coincident faces would z-fight.
	 */
	#createBlockGeometry(size, gap) {
		// Standing on a corner makes the block sqrt(3) taller than its edge,
		// so `extent` is the cube edge, not the height you see.
		const extent = size * 0.95;
		const edge = (extent / 2) * (1 - gap);
		const offset = (extent / 4) * (1 + gap);

		const cubes = [];
		for (let x = 0; x < 2; x++) {
			for (let y = 0; y < 2; y++) {
				for (let z = 0; z < 2; z++) {
					const cube = new THREE.BoxGeometry(edge, edge, edge);
					cube.translate(
						(x * 2 - 1) * offset,
						(y * 2 - 1) * offset,
						(z * 2 - 1) * offset,
					);
					cubes.push(cube);
				}
			}
		}

		const merged = mergeGeometries(cubes);
		cubes.forEach((cube) => cube.dispose());

		/*
		 * Stand it on a corner, so a body diagonal runs vertical: 45 deg about
		 * Y swings one diagonal into the XY plane, then atan(sqrt 2) about Z
		 * lifts it onto +Y. The silhouette is then a diamond from every
		 * horizontal angle, not just the one the camera happens to sit at.
		 *
		 * Baked into the geometry rather than set on the mesh for two reasons.
		 * The group's Y spin in update() leaves +Y alone, so the top point
		 * stays put and the block turns about its own diagonal instead of
		 * wobbling. And both morph targets go through the same rotation in the
		 * same vertex order, which is what keeps vertex i paired across shapes.
		 */
		merged.rotateY(Math.PI / 4);
		merged.rotateZ(Math.atan(Math.SQRT2));
		return merged;
	}

	#padToCount(geometry, vertexCount) {
		const pos = geometry.getAttribute("position").array;
		const nor = geometry.getAttribute("normal").array;
		const srcCount = pos.length / 3;

		const positions = new Float32Array(vertexCount * 3);
		const normals = new Float32Array(vertexCount * 3);
		positions.set(pos);
		normals.set(nor);

		for (let v = srcCount; v < vertexCount; v += 3) {
			const src = (v % srcCount) * 3;
			for (let i = 0; i < 3; i++) {
				const dst = (v + i) * 3;
				positions[dst] = pos[src];
				positions[dst + 1] = pos[src + 1];
				positions[dst + 2] = pos[src + 2];
				normals[dst] = nor[src];
				normals[dst + 1] = nor[src + 1];
				normals[dst + 2] = nor[src + 2];
			}
		}

		return { positions, normals };
	}

	#setShapes(fromIndex, toIndex) {
		const geometry = this.mesh.geometry;
		const from = this.shapes[fromIndex];
		const to = this.shapes[toIndex];

		geometry.getAttribute("position").array.set(from.positions);
		geometry.getAttribute("normal").array.set(from.normals);
		geometry.getAttribute("aTargetPosition").array.set(to.positions);
		geometry.getAttribute("aTargetNormal").array.set(to.normals);
		for (const name of [
			"position",
			"normal",
			"aTargetPosition",
			"aTargetNormal",
		]) {
			geometry.getAttribute(name).needsUpdate = true;
		}
	}

	setBasePosition(x, y, z) {
		this.position.set(x, y, z);
		this.baseY = y;
	}

	setCellScale(scale) {
		this.mesh.material.uniforms.uCellSize.value =
			(this.cellSize * Math.min(window.devicePixelRatio, 2)) / scale;
	}

	update(elapsed) {
		const uniforms = this.mesh.material.uniforms;
		uniforms.uTime.value = elapsed;

		const cycle = this.morphHold + this.morphDuration;
		const cycleIndex = Math.floor(elapsed / cycle);
		if (cycleIndex !== this.cycleIndex) {
			this.cycleIndex = cycleIndex;
			const count = this.shapes.length;
			this.#setShapes(cycleIndex % count, (cycleIndex + 1) % count);
		}
		const local = elapsed - cycleIndex * cycle;
		const morph = THREE.MathUtils.clamp(
			(local - this.morphHold) / this.morphDuration,
			0,
			1,
		);
		uniforms.uMorph.value = morph;

		const pulse = morph * (1.0 - morph) * 7.0;
		this.glow.intensity = this.glowIntensity * (1.0 + 0.5 * pulse);

		this.rotation.y = elapsed * this.spinSpeed;

		this.position.y =
			this.baseY + Math.sin(elapsed * this.floatSpeed) * this.floatAmplitude;
	}
}
