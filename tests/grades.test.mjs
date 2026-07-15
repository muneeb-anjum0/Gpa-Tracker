import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_COURSE_NAME_LENGTH,
  MAX_COURSES_PER_SEMESTER,
  MAX_SEMESTER_NAME_LENGTH,
  MAX_SEMESTERS,
  sanitizeSemesters,
} from '../src/lib/grades.js'

describe('grade-file validation', () => {
  it('rejects non-array imports', () => {
    assert.deepEqual(sanitizeSemesters({ semesters: [] }), [])
    assert.deepEqual(sanitizeSemesters(null), [])
  })

  it('normalizes unexpected fields and unsafe values', () => {
    const [semester] = sanitizeSemesters([
      {
        id: '42',
        name: `  ${'A'.repeat(MAX_SEMESTER_NAME_LENGTH + 20)}\u0000  `,
        courses: [
          {
            id: '99',
            name: `  ${'B'.repeat(MAX_COURSE_NAME_LENGTH + 20)}\u0000  `,
            creditHours: '-5',
            grade: '<script>',
            ownerId: 'attacker',
          },
        ],
        ownerId: 'attacker',
      },
    ])

    assert.deepEqual(Object.keys(semester), ['id', 'name', 'courses'])
    assert.equal(semester.id, 42)
    assert.equal(semester.name.length, MAX_SEMESTER_NAME_LENGTH)
    assert.deepEqual(Object.keys(semester.courses[0]), ['id', 'name', 'creditHours', 'grade'])
    assert.equal(semester.courses[0].id, 99)
    assert.equal(semester.courses[0].name.length, MAX_COURSE_NAME_LENGTH)
    assert.equal(semester.courses[0].creditHours, 0)
    assert.equal(semester.courses[0].grade, 'B')
  })

  it('bounds imported semester and course counts', () => {
    const source = Array.from({ length: MAX_SEMESTERS + 10 }, (_, semesterIndex) => ({
      id: semesterIndex + 1,
      name: `Semester ${semesterIndex + 1}`,
      courses: Array.from({ length: MAX_COURSES_PER_SEMESTER + 10 }, (_, courseIndex) => ({
        id: courseIndex + 1,
        name: `Course ${courseIndex + 1}`,
        creditHours: 3,
        grade: 'A',
      })),
    }))

    const sanitized = sanitizeSemesters(source)

    assert.equal(sanitized.length, MAX_SEMESTERS)
    assert.equal(sanitized[0].courses.length, MAX_COURSES_PER_SEMESTER)
  })
})
