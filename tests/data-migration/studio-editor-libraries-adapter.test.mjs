import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { adaptStudioEditorLibrariesPreferences } from '../../scripts/data-migration/studio-editor-libraries-adapter.mjs'

const writeJson = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value)) }
const project = (id, kind) => ({ schemaVersion: 1, id, title: 'Synthetic', color: '#112233', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, assets: [], elements: [], ...(kind === 'editorV6' ? { timeline: { tracks: [] } } : {}) })

test('converts Studio, Editor V6, libraries, and portable preferences while hashing embedded media', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-studio-adapter-'))
  const profile = path.join(temporary, 'runtime', 'profile')
  try {
    await writeJson(path.join(profile, 'studios', 'Studio Principal', 'studio-a', 'studio.json'), { ...project('studio-a', 'studio'), assets: [{ id: 'img-a', category: 'background', name: 'BG', mimeType: 'image/png', dataUrl: `data:image/png;base64,${Buffer.from('png bytes').toString('base64')}` }] })
    await writeJson(path.join(profile, 'studios', 'Editor V6', 'editorV6-a', 'editorV6.json'), project('editorV6-a', 'editorV6'))
    await mkdir(path.join(profile, 'studios', 'Editor V6', 'editorV6-a', 'assets', 'characters'), { recursive: true })
    await writeFile(path.join(profile, 'studios', 'Editor V6', 'editorV6-a', 'assets', 'characters', 'asset-a.png'), 'sidecar bytes')
    const mediaRoot = path.join(profile, 'studios', 'Editor Gacha', 'media-library')
    await writeJson(path.join(mediaRoot, 'catalog.json'), { schemaVersion: 1, items: [{ id: 'video-a', title: 'Video', name: 'Video' }] })
    await mkdir(path.join(mediaRoot, 'videos'), { recursive: true })
    await writeFile(path.join(mediaRoot, 'videos', 'video-a.mp4'), 'video bytes')
    const backgroundRoot = path.join(profile, 'studios', 'Editor Gacha', 'background-library')
    await writeJson(path.join(backgroundRoot, 'catalog.json'), { schemaVersion: 1, items: [{ id: 'background-a', name: 'BG' }] })
    await mkdir(path.join(backgroundRoot, 'images'), { recursive: true })
    await writeFile(path.join(backgroundRoot, 'images', 'background-a.png'), 'background bytes')
    await writeJson(path.join(profile, 'editor-v6-export-folder.json'), { folder: 'C:/private/user/path' })

    const result = await adaptStudioEditorLibrariesPreferences({ appDataRoot: temporary })
    assert.equal(result.domains.studio.projects[0].id, 'studio-a')
    assert.deepEqual(result.domains.studio.projects[0].document.assets[0].dataUrl, { $asset: result.domains.studio.projects[0].document.assets[0].dataUrl.$asset })
    assert.equal(result.domains.editorV6.projects[0].id, 'editorV6-a')
    assert.equal(result.domains.libraries.videos[0].item.id, 'video-a')
    assert.equal(result.domains.libraries.backgrounds[0].item.id, 'background-a')
    assert.deepEqual(result.domains.preferences.editorV6Export, { configured: true, value: null, resetReason: 'machine-local-path-not-portable' })
    assert.equal(JSON.stringify(result).includes('private/user/path'), false)
    assert.equal(result.assets.length, 4)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})

test('blocks malformed project documents and missing library media without discarding metadata', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nymi-studio-invalid-'))
  try {
    const studioFolder = path.join(temporary, 'runtime', 'profile', 'studios', 'Studio Principal', 'studio-b')
    await writeJson(path.join(studioFolder, 'studio.json'), { schemaVersion: 2, id: 'studio-b', assets: [], elements: [] })
    const mediaRoot = path.join(temporary, 'runtime', 'profile', 'studios', 'Editor Gacha', 'media-library')
    await writeJson(path.join(mediaRoot, 'catalog.json'), { items: [{ id: 'missing-video' }] })
    const result = await adaptStudioEditorLibrariesPreferences({ appDataRoot: temporary })
    assert.ok(result.blocked.some((item) => item.code === 'project-schema-invalid'))
    assert.ok(result.blocked.some((item) => item.code === 'video-library-media-missing'))
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
