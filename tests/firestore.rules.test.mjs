import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  deleteDoc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { sanitizeSemesters } from '../src/lib/grades.js'

const PROJECT_ID = 'gpa-tracker-rules-test'
const RULES = readFileSync('firebase/firestore.rules', 'utf8')
const FILE_NAME = 'CURRENT-GRADES.json'
const STARTER_GRADES = sanitizeSemesters(JSON.parse(readFileSync('src/data/current-grades.json', 'utf8')))

let testEnv

function validGradeFile(overrides = {}) {
  return {
    fileName: FILE_NAME,
    gradeScale: 'zab',
    semesters: [
      {
        id: 1,
        name: 'Semester 1',
        courses: [
          {
            id: 1,
            name: 'Information Security',
            creditHours: 3,
            grade: 'A',
          },
        ],
      },
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

function fileRef(db, uid = 'user-a', fileName = FILE_NAME) {
  return doc(db, 'users', uid, 'files', fileName)
}

describe('Firestore security rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: RULES,
      },
    })
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
  })

  after(async () => {
    await testEnv.cleanup()
  })

  it('allows an authenticated owner to create, read, and update their grade file', async () => {
    const ownerDb = testEnv.authenticatedContext('user-a').firestore()
    const ref = fileRef(ownerDb)

    await assertSucceeds(setDoc(ref, validGradeFile()))
    await assertSucceeds(getDoc(ref))
    await assertSucceeds(updateDoc(ref, {
      semesters: validGradeFile().semesters,
      updatedAt: serverTimestamp(),
    }))
  })

  it('allows the bundled starter grade file shape', async () => {
    const ownerDb = testEnv.authenticatedContext('user-a').firestore()

    await assertSucceeds(setDoc(fileRef(ownerDb), validGradeFile({
      semesters: STARTER_GRADES,
    })))
  })

  it('rejects unauthenticated reads and writes', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(getDoc(fileRef(anonDb)))
    await assertFails(setDoc(fileRef(anonDb), validGradeFile()))
  })

  it('prevents one user from reading or modifying another user grade file', async () => {
    const ownerDb = testEnv.authenticatedContext('user-a').firestore()
    const attackerDb = testEnv.authenticatedContext('user-b').firestore()

    await assertSucceeds(setDoc(fileRef(ownerDb), validGradeFile()))
    await assertFails(getDoc(fileRef(attackerDb, 'user-a')))
    await assertFails(updateDoc(fileRef(attackerDb, 'user-a'), {
      semesters: [],
      updatedAt: serverTimestamp(),
    }))
  })

  it('rejects unexpected file names and document fields', async () => {
    const ownerDb = testEnv.authenticatedContext('user-a').firestore()

    await assertFails(setDoc(fileRef(ownerDb, 'user-a', 'OTHER.json'), validGradeFile({
      fileName: 'OTHER.json',
    })))
    await assertFails(setDoc(fileRef(ownerDb), validGradeFile({
      ownerId: 'user-a',
    })))
  })

  it('rejects invalid grade-file shapes', async () => {
    const ownerDb = testEnv.authenticatedContext('user-a').firestore()

    await assertFails(setDoc(fileRef(ownerDb), validGradeFile({
      gradeScale: 'admin',
    })))
    await assertFails(setDoc(fileRef(ownerDb), validGradeFile({
      semesters: 'not-a-list',
    })))
    await assertFails(setDoc(fileRef(ownerDb), validGradeFile({
      semesters: Array.from({ length: 25 }, (_, index) => ({
        id: index + 1,
        name: `Semester ${index + 1}`,
        courses: [],
      })),
    })))
  })

  it('denies client-side delete attempts', async () => {
    const ownerDb = testEnv.authenticatedContext('user-a').firestore()
    const ref = fileRef(ownerDb)

    await assertSucceeds(setDoc(ref, validGradeFile()))
    const snapshot = await assertSucceeds(getDoc(ref))
    assert.equal(snapshot.exists(), true)
    await assertFails(deleteDoc(ref))
  })
})
