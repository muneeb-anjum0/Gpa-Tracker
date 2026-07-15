export const CURRENT_GRADES_FILE = 'CURRENT-GRADES.json'

export const UNIVERSITY_SCHEMES = {
  zab: {
    name: 'ZAB / 4.00 scale',
    max: 4,
    points: {
      'A+': 4,
      A: 3.75,
      'A-': 3.5,
      'B+': 3.25,
      B: 3,
      'B-': 2.75,
      'C+': 2.5,
      C: 2,
      'C-': 1.5,
      F: 0,
    },
    ranges: {
      'A+': '90+',
      A: '85-89',
      'A-': '80-84',
      'B+': '75-79',
      B: '70-74',
      'B-': '66-69',
      'C+': '63-65',
      C: '60-62',
      'C-': '55-59',
      F: '0-54',
    },
  },
  standard: {
    name: 'Standard 4.00 scale',
    max: 4,
    points: {
      A: 4,
      'A-': 3.7,
      'B+': 3.3,
      B: 3,
      'B-': 2.7,
      'C+': 2.3,
      C: 2,
      'C-': 1.7,
      D: 1,
      F: 0,
    },
    ranges: {
      A: '93-100',
      'A-': '90-92',
      'B+': '87-89',
      B: '83-86',
      'B-': '80-82',
      'C+': '77-79',
      C: '73-76',
      'C-': '70-72',
      D: '60-69',
      F: '0-59',
    },
  },
  fivePoint: {
    name: '5.00 honors scale',
    max: 5,
    points: {
      'A+': 5,
      A: 4.75,
      'A-': 4.5,
      'B+': 4,
      B: 3.5,
      'B-': 3,
      'C+': 2.5,
      C: 2,
      D: 1,
      F: 0,
    },
    ranges: {
      'A+': '95-100',
      A: '90-94',
      'A-': '85-89',
      'B+': '80-84',
      B: '75-79',
      'B-': '70-74',
      'C+': '65-69',
      C: '60-64',
      D: '50-59',
      F: '0-49',
    },
  },
}

export const DEFAULT_SCHEME_KEY = 'zab'
export const MAX_SEMESTERS = 24
export const MAX_COURSES_PER_SEMESTER = 30
export const MAX_SEMESTER_NAME_LENGTH = 80
export const MAX_COURSE_NAME_LENGTH = 120
export const MAX_JSON_IMPORT_BYTES = 200_000

const ALL_GRADES = new Set(Object.values(UNIVERSITY_SCHEMES).flatMap((scheme) => Object.keys(scheme.points)))

export function getScheme(key) {
  return UNIVERSITY_SCHEMES[key] || UNIVERSITY_SCHEMES[DEFAULT_SCHEME_KEY]
}

export function isValidGradeScale(value) {
  return Object.hasOwn(UNIVERSITY_SCHEMES, value)
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0)
      return codePoint > 31 && codePoint !== 127
    })
    .join('')
    .trim()
    .slice(0, maxLength)
}

function cleanPositiveNumber(value, fallback = 0) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue < 0) return fallback
  return Number(numericValue.toFixed(2))
}

function cleanId(value) {
  const numericValue = Number(value)
  return Number.isSafeInteger(numericValue) && numericValue > 0 ? numericValue : Date.now()
}

export function sanitizeCourse(course) {
  const source = course && typeof course === 'object' ? course : {}
  const grade = typeof source.grade === 'string' && ALL_GRADES.has(source.grade) ? source.grade : 'B'

  return {
    id: cleanId(source.id),
    name: cleanText(source.name, MAX_COURSE_NAME_LENGTH),
    creditHours: cleanPositiveNumber(source.creditHours, 0),
    grade,
  }
}

export function sanitizeSemester(semester) {
  const source = semester && typeof semester === 'object' ? semester : {}
  const courses = Array.isArray(source.courses) ? source.courses : []

  return {
    id: cleanId(source.id),
    name: cleanText(source.name, MAX_SEMESTER_NAME_LENGTH) || 'Semester',
    courses: courses.slice(0, MAX_COURSES_PER_SEMESTER).map(sanitizeCourse),
  }
}

export function sanitizeSemesters(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_SEMESTERS).map(sanitizeSemester)
}
