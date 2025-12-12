/**
 * ========================================
 * Animation System for Skeletal Animation
 * ========================================
 * Handles smooth animation transitions and bone matrix calculation
 */

import { quatSlerp, vec3Lerp, trsToMatrix, mat4Multiply } from './glb-loader.js';

/**
 * Animation system with smooth transitions
 */
export class AnimationSystem {
  constructor(skeleton, animations) {
    this.skeleton = skeleton;
    this.animations = animations;
    this.currentAnimation = null;
    this.previousAnimation = null;
    this.currentTime = 0;
    this.previousTime = 0;
    this.transitionTime = 0;
    this.transitionDuration = 0.25; // 250ms transition between animations
    this.isTransitioning = false;
    this.speed = 1;
    this.boneMatrices = new Float32Array(skeleton.jointCount * 16);

    // Store transforms for current and previous animations
    this.currentTransforms = skeleton.hierarchy.map(j => ({
      translation: [...j.translation],
      rotation: [...j.rotation],
      scale: [...j.scale]
    }));
    this.previousTransforms = skeleton.hierarchy.map(j => ({
      translation: [...j.translation],
      rotation: [...j.rotation],
      scale: [...j.scale]
    }));
    this.blendedTransforms = skeleton.hierarchy.map(j => ({
      translation: [...j.translation],
      rotation: [...j.rotation],
      scale: [...j.scale]
    }));

    // Initialize with identity matrices
    for (let i = 0; i < skeleton.jointCount; i++) {
      this.boneMatrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], i * 16);
    }
  }

  play(animationName) {
    if (!this.animations[animationName]) {
      console.warn(`Animation "${animationName}" not found. Available:`, Object.keys(this.animations));
      return;
    }

    // If same animation, don't restart
    if (this.currentAnimation?.name === animationName) return;

    // Start transition from current to new animation
    if (this.currentAnimation) {
      this.previousAnimation = this.currentAnimation;
      this.previousTime = this.currentTime;
      // Copy current transforms to previous
      for (let i = 0; i < this.skeleton.jointCount; i++) {
        this.previousTransforms[i].translation = [...this.currentTransforms[i].translation];
        this.previousTransforms[i].rotation = [...this.currentTransforms[i].rotation];
        this.previousTransforms[i].scale = [...this.currentTransforms[i].scale];
      }
      this.isTransitioning = true;
      this.transitionTime = 0;
    }

    this.currentAnimation = this.animations[animationName];
    this.currentTime = 0;
    console.log(`Playing: ${animationName}${this.isTransitioning ? ' (transitioning)' : ''}`);
  }

  // Sample animation at a specific time and store in transforms array
  sampleAnimation(animation, time, transforms) {
    // Reset to bind pose
    for (let i = 0; i < this.skeleton.jointCount; i++) {
      const joint = this.skeleton.hierarchy[i];
      transforms[i].translation = [...joint.translation];
      transforms[i].rotation = [...joint.rotation];
      transforms[i].scale = [...joint.scale];
    }

    if (!animation) return;

    // Apply animation tracks
    for (const track of animation.tracks) {
      const jointIndex = this.skeleton.joints.indexOf(track.nodeName);
      if (jointIndex === -1) continue;

      // Find keyframes
      const times = track.times;
      let keyIndex = 0;
      for (let i = 0; i < times.length - 1; i++) {
        if (time >= times[i] && time < times[i + 1]) {
          keyIndex = i;
          break;
        }
        if (i === times.length - 2) keyIndex = i;
      }

      const t0 = times[keyIndex];
      const t1 = times[Math.min(keyIndex + 1, times.length - 1)];
      const alpha = t1 > t0 ? (time - t0) / (t1 - t0) : 0;

      const v0 = track.values[keyIndex];
      const v1 = track.values[Math.min(keyIndex + 1, track.values.length - 1)];

      if (track.property === 'rotation') {
        transforms[jointIndex].rotation = quatSlerp(v0, v1, alpha);
      } else if (track.property === 'translation') {
        transforms[jointIndex].translation = vec3Lerp(v0, v1, alpha);
      } else if (track.property === 'scale') {
        transforms[jointIndex].scale = vec3Lerp(v0, v1, alpha);
      }
    }
  }

  update(deltaTime) {
    if (!this.currentAnimation) return;

    // Update current animation time
    this.currentTime += deltaTime * this.speed;
    if (this.currentTime > this.currentAnimation.duration) {
      this.currentTime %= this.currentAnimation.duration;
    }

    // Sample current animation
    this.sampleAnimation(this.currentAnimation, this.currentTime, this.currentTransforms);

    // Handle transition blending
    if (this.isTransitioning) {
      this.transitionTime += deltaTime;

      // Update previous animation time (keep it running during transition)
      if (this.previousAnimation) {
        this.previousTime += deltaTime * this.speed;
        if (this.previousTime > this.previousAnimation.duration) {
          this.previousTime %= this.previousAnimation.duration;
        }
        this.sampleAnimation(this.previousAnimation, this.previousTime, this.previousTransforms);
      }

      // Calculate blend factor (0 = previous, 1 = current)
      const blendFactor = Math.min(1, this.transitionTime / this.transitionDuration);
      // Use smooth step for nicer easing
      const smoothBlend = blendFactor * blendFactor * (3 - 2 * blendFactor);

      // Blend transforms
      for (let i = 0; i < this.skeleton.jointCount; i++) {
        this.blendedTransforms[i].translation = vec3Lerp(
          this.previousTransforms[i].translation,
          this.currentTransforms[i].translation,
          smoothBlend
        );
        this.blendedTransforms[i].rotation = quatSlerp(
          this.previousTransforms[i].rotation,
          this.currentTransforms[i].rotation,
          smoothBlend
        );
        this.blendedTransforms[i].scale = vec3Lerp(
          this.previousTransforms[i].scale,
          this.currentTransforms[i].scale,
          smoothBlend
        );
      }

      // End transition when complete
      if (blendFactor >= 1) {
        this.isTransitioning = false;
        this.previousAnimation = null;
      }
    } else {
      // No transition, use current transforms directly
      for (let i = 0; i < this.skeleton.jointCount; i++) {
        this.blendedTransforms[i].translation = [...this.currentTransforms[i].translation];
        this.blendedTransforms[i].rotation = [...this.currentTransforms[i].rotation];
        this.blendedTransforms[i].scale = [...this.currentTransforms[i].scale];
      }
    }

    // Calculate world transforms from blended local transforms
    const worldMatrices = new Array(this.skeleton.jointCount);

    // Find root joints (not children of any other joint)
    const childSet = new Set();
    this.skeleton.hierarchy.forEach(j => j.children.forEach(c => childSet.add(c)));

    const computeWorldMatrix = (jointIndex, parentMatrix) => {
      const local = this.blendedTransforms[jointIndex];
      const localMatrix = trsToMatrix(local.translation, local.rotation, local.scale);
      const worldMatrix = parentMatrix ? mat4Multiply(parentMatrix, localMatrix) : localMatrix;
      worldMatrices[jointIndex] = worldMatrix;

      // Process children
      for (const childIndex of this.skeleton.hierarchy[jointIndex].children) {
        computeWorldMatrix(childIndex, worldMatrix);
      }
    };

    // Start from root joints
    for (let i = 0; i < this.skeleton.jointCount; i++) {
      if (!childSet.has(i)) {
        computeWorldMatrix(i, null);
      }
    }

    // Apply inverse bind matrices
    for (let i = 0; i < this.skeleton.jointCount; i++) {
      if (worldMatrices[i] && this.skeleton.inverseBindMatrices[i]) {
        const finalMatrix = mat4Multiply(worldMatrices[i], this.skeleton.inverseBindMatrices[i]);
        this.boneMatrices.set(finalMatrix, i * 16);
      }
    }
  }

  getBoneMatrices() {
    return this.boneMatrices;
  }
}
