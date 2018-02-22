const RenderedTarget = require('./rendered-target');
const Blocks = require('../engine/blocks');
const {loadSoundFromAsset} = require('../import/load-sound');
const {loadCostumeFromAsset} = require('../import/load-costume');
const StringUtil = require('../util/string-util');

class Sprite {
    /**
     * Sprite to be used on the Scratch stage.
     * All clones of a sprite have shared blocks, shared costumes, shared variables.
     * @param {?Blocks} blocks Shared blocks object for all clones of sprite.
     * @param {Runtime} runtime Reference to the runtime.
     * @constructor
     */
    constructor (blocks, runtime) {
        this.runtime = runtime;
        if (!blocks) {
            // Shared set of blocks for all clones.
            blocks = new Blocks();
        }
        this.blocks = blocks;
        /**
         * Human-readable name for this sprite (and all clones).
         * @type {string}
         */
        this.name = '';
        /**
         * List of costumes for this sprite.
         * Each entry is an object, e.g.,
         * {
         *      skinId: 1,
         *      name: "Costume Name",
         *      bitmapResolution: 2,
         *      rotationCenterX: 0,
         *      rotationCenterY: 0,
         *      costumeId: 0
         * }
         * @type {Array.<!Object>}
         */
        this.costumes_ = [];
        /**
         * List of sounds for this sprite.
        */
        this.sounds = [];
        /**
         * List of clones for this sprite, including the original.
         * @type {Array.<!RenderedTarget>}
         */
        this.clones = [];
        /**
         * A costume ID generator. Costumes within a sprite should each have a unique ID.
         */
        this.nextCostumeId = 0;
    }

    /**
     * Get full costume list
     * @return {object[]} list of costumes
     */
    getCostumes () {
        return this.costumes_;
    }

    /**
     * Get costume at index
     * @param {int} index Index
     * @return {object} costumes
     */
    getCostumeByIndex (index) {
        return this.costumes_[index];
    }
    
    /**
     * Add a costume, taking care to avoid duplicate names.
     * @param {!object} costumeObject Object representing the costume.
     */
    addCostume (costumeObject) {
        this.addCostumeAt(costumeObject, this.costumes_.length);
    }

    /**
     * Add an array of costumes, taking care to avoid duplicate names.
     * @param {!Array<object>} costumes Array of objects representing costumes.
     */
    addCostumes (costumes) {
        for (const costume of costumes) {
            this.addCostumeAt(costume, this.costumes_.length);
        }
    }

    /**
     * Add a costume at the given index, taking care to avoid duplicate names.
     * @param {!object} costumeObject Object representing the costume.
     * @param {!int} index Index at which to add costume
     */
    addCostumeAt (costumeObject, index) {
        const usedNames = this.costumes_.map(costume => costume.name);
        costumeObject.name = StringUtil.unusedName(costumeObject.name, usedNames);
        costumeObject.costumeId = this.nextCostumeId;
        this.nextCostumeId++;
        this.costumes_.splice(index, 0, costumeObject);
    }

    /**
     * Delete a costume by index.
     * @param {number} index Costume index to be deleted
     */
    deleteCostumeByIndex (index) {
        this.costumes_ = this.costumes_
            .slice(0, index)
            .concat(this.costumes_.slice(index + 1));
    }

    /**
     * Create a clone of this sprite.
     * @returns {!RenderedTarget} Newly created clone.
     */
    createClone () {
        const newClone = new RenderedTarget(this, this.runtime);
        newClone.isOriginal = this.clones.length === 0;
        this.clones.push(newClone);
        newClone.initAudio();
        if (newClone.isOriginal) {
            newClone.initDrawable();
            this.runtime.fireTargetWasCreated(newClone);
        } else {
            this.runtime.fireTargetWasCreated(newClone, this.clones[0]);
        }
        return newClone;
    }

    /**
     * Disconnect a clone from this sprite. The clone is unmodified.
     * In particular, the clone's dispose() method is not called.
     * @param {!RenderedTarget} clone - the clone to be removed.
     */
    removeClone (clone) {
        this.runtime.fireTargetWasRemoved(clone);
        const cloneIndex = this.clones.indexOf(clone);
        if (cloneIndex >= 0) {
            this.clones.splice(cloneIndex, 1);
        }
    }

    duplicate () {
        const newSprite = new Sprite(null, this.runtime);

        newSprite.blocks = this.blocks.duplicate();

        const allNames = this.runtime.targets.map(t => t.name);
        newSprite.name = StringUtil.unusedName(this.name, allNames);

        const assetPromises = [];

        newSprite.addCostumes(this.costumes_.map(costume => {
            const newCostume = Object.assign({}, costume);
            const costumeAsset = this.runtime.storage.get(costume.assetId);
            assetPromises.push(loadCostumeFromAsset(newCostume, costumeAsset, this.runtime));
            return newCostume;
        }));

        newSprite.sounds = this.sounds.map(sound => {
            const newSound = Object.assign({}, sound);
            const soundAsset = this.runtime.storage.get(sound.assetId);
            assetPromises.push(loadSoundFromAsset(newSound, soundAsset, this.runtime));
            return newSound;
        });

        return Promise.all(assetPromises).then(() => newSprite);
    }
}

module.exports = Sprite;
