import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  GraduationCap,
  LineChart as LineChartIcon,
  Loader2,
  Lock,
  LogOut,
  Plus,
  Route,
  Save,
  School,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react'
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import starterGrades from './data/current-grades.json'
import Dock from './components/Dock'
import { auth, CURRENT_GRADES_FILE, db, firebaseReady } from './lib/firebase'
import './styles/App.css'

const UNIVERSITY_SCHEMES = {
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

const DEFAULT_SCHEME_KEY = 'zab'

const CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#0f766e', '#f97316', '#64748b', '#db2777', '#111827']
const GRADE_BAR_COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#f97316', '#f59e0b', '#10b981', '#0ea5e9', '#64748b', '#ef4444', '#111827']
const EMPTY_SEMESTERS = []
const SESSION_STARTED_AT_KEY = 'gpa-track-session-started-at'
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const CHART_MARGIN = { top: 6, right: 0, bottom: 0, left: -28 }

function getScheme(key) {
  return UNIVERSITY_SCHEMES[key] || UNIVERSITY_SCHEMES[DEFAULT_SCHEME_KEY]
}

function getPoints(grade, scheme = getScheme(DEFAULT_SCHEME_KEY)) {
  return scheme.points[grade] ?? 0
}

function getCredits(course) {
  const value = Number.parseFloat(course.creditHours)
  return Number.isFinite(value) ? value : 0
}

function calculateSGPA(semester, scheme = getScheme(DEFAULT_SCHEME_KEY)) {
  const totalCredits = semester.courses.reduce((sum, course) => sum + getCredits(course), 0)
  const totalPoints = semester.courses.reduce((sum, course) => sum + getPoints(course.grade, scheme) * getCredits(course), 0)
  return totalCredits > 0 ? Number((totalPoints / totalCredits).toFixed(2)) : 0
}

function calculateCGPA(semesters, scheme = getScheme(DEFAULT_SCHEME_KEY)) {
  const totals = semesters.reduce(
    (result, semester) => {
      semester.courses.forEach((course) => {
        const credits = getCredits(course)
        result.points += getPoints(course.grade, scheme) * credits
        result.credits += credits
      })
      return result
    },
    { points: 0, credits: 0 },
  )

  return totals.credits > 0 ? Number((totals.points / totals.credits).toFixed(2)) : 0
}

function cloneGrades(grades) {
  return JSON.parse(JSON.stringify(grades))
}

function normalizeSemesters(value) {
  return Array.isArray(value) ? value : EMPTY_SEMESTERS
}

function startSessionWindow() {
  localStorage.setItem(SESSION_STARTED_AT_KEY, Date.now().toString())
}

function clearSessionWindow() {
  localStorage.removeItem(SESSION_STARTED_AT_KEY)
}

function isSessionExpired() {
  const sessionStartedAt = Number(localStorage.getItem(SESSION_STARTED_AT_KEY))

  if (!Number.isFinite(sessionStartedAt) || sessionStartedAt <= 0) {
    startSessionWindow()
    return false
  }

  return Date.now() - sessionStartedAt > SESSION_MAX_AGE_MS
}

function AuthScreen({ authError, setAuthError }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setAuthError('')

    if (!firebaseReady) {
      setAuthError('Add your Firebase keys to .env, then restart the Vite dev server.')
      return
    }

    setIsSubmitting(true)
    try {
      await setPersistence(auth, browserLocalPersistence)
      startSessionWindow()
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        await createUserWithEmailAndPassword(auth, email, password)
      }
    } catch (error) {
      clearSessionWindow()
      setAuthError(error.message.replace('Firebase: ', ''))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <Motion.section
        className="auth-shell"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <div className="auth-art" aria-hidden="true">
          <Motion.div
            className="orbit orbit-one"
            animate={{ rotate: 360 }}
            transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
          />
          <Motion.div
            className="orbit orbit-two"
            animate={{ rotate: -360 }}
            transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
          />
          <div className="auth-score">
            <GraduationCap size={30} />
            <strong>4.00</strong>
            <span>target lane</span>
          </div>
        </div>

        <div className="auth-panel">
          <div className="brand-mark">
            <div className="brand-icon">
              <LineChartIcon size={22} />
            </div>
            <div>
              <p>GPA Tracker</p>
              <span>Email and password workspace</span>
            </div>
          </div>

          <div className="auth-copy">
            <p className="eyebrow">Private academic dashboard</p>
            <h1>Track every grade with a calm, focused view.</h1>
          </div>

          <div className="mode-toggle" role="tablist" aria-label="Authentication mode">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              <Lock size={16} />
              Login
            </button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
              <UserPlus size={16} />
              Sign up
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
            </label>
            <button className="primary-action" type="submit" disabled={isSubmitting || !firebaseReady}>
              {isSubmitting ? <Loader2 className="spin" size={18} /> : <Lock size={18} />}
              {mode === 'login' ? 'Enter tracker' : 'Create tracker'}
            </button>
          </form>

          <AnimatePresence>
            {(!firebaseReady || authError) && (
              <Motion.p className="form-error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {authError || 'Firebase keys are missing. Fill .env and restart the dev server.'}
              </Motion.p>
            )}
          </AnimatePresence>
        </div>
      </Motion.section>
    </main>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [semesters, setSemesters] = useState([])
  const [expandedSemesters, setExpandedSemesters] = useState(new Set())
  const [dataLoading, setDataLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isMomentumHovered, setIsMomentumHovered] = useState(false)
  const [isGradeHovered, setIsGradeHovered] = useState(false)
  const [isCommandOpen, setIsCommandOpen] = useState(false)
  const [activeFeature, setActiveFeature] = useState('goals')
  const [searchQuery, setSearchQuery] = useState('')
  const [targetCgpa, setTargetCgpa] = useState('3.50')
  const [plannedCredits, setPlannedCredits] = useState('15')
  const [selectedSchemeKey, setSelectedSchemeKey] = useState(DEFAULT_SCHEME_KEY)
  const fileInputRef = useRef(null)
  const userHandle = user?.email?.split('@')[0] || 'user'
  const activeScheme = getScheme(selectedSchemeKey)

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsCommandOpen(true)
      }
      if (event.key === 'Escape') {
        setIsCommandOpen(false)
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    if (!firebaseReady) {
      setAuthLoading(false)
      return undefined
    }

    return onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser && isSessionExpired()) {
        await signOut(auth)
        clearSessionWindow()
        setUser(null)
        setAuthError('Your 30-day session expired. Please sign in again.')
        setAuthLoading(false)
        return
      }

      setUser(nextUser)
      if (!nextUser) {
        clearSessionWindow()
      }
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user || !firebaseReady) {
      setSemesters([])
      setExpandedSemesters(new Set())
      return undefined
    }

    setDataLoading(true)
    const fileRef = doc(db, 'users', user.uid, 'files', CURRENT_GRADES_FILE)

    const unsubscribe = onSnapshot(
      fileRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          const nextSemesters = normalizeSemesters(data.semesters)
          setSemesters(nextSemesters)
          setSelectedSchemeKey(data.gradeScale || DEFAULT_SCHEME_KEY)
          setLastSaved(data.updatedAt?.toDate?.() || null)
          setExpandedSemesters(new Set())
          setHasUnsavedChanges(false)
          setDataLoading(false)
          return
        }

        const starter = cloneGrades(starterGrades)
        await setDoc(fileRef, {
          fileName: CURRENT_GRADES_FILE,
          semesters: starter,
          gradeScale: DEFAULT_SCHEME_KEY,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        setSemesters(starter)
        setExpandedSemesters(new Set())
        setHasUnsavedChanges(false)
        setDataLoading(false)
      },
      (error) => {
        setStatusMessage(error.message)
        setDataLoading(false)
      },
    )

    return unsubscribe
  }, [user])

  const stats = useMemo(() => {
    const cgpa = calculateCGPA(semesters, activeScheme)
    const totalCredits = semesters.reduce((sum, semester) => sum + semester.courses.reduce((courseSum, course) => courseSum + getCredits(course), 0), 0)
    const totalCourses = semesters.reduce((sum, semester) => sum + semester.courses.length, 0)
    const chronologicalSemesters = [...semesters].sort((a, b) => Number(a.id) - Number(b.id))
    const semesterData = chronologicalSemesters.map((semester, index) => ({
      name: semester.name,
      shortName: `S${index + 1}`,
      SGPA: calculateSGPA(semester, activeScheme),
      credits: semester.courses.reduce((sum, course) => sum + getCredits(course), 0),
      courses: semester.courses.length,
    }))
    let cumulativePoints = 0
    let cumulativeCredits = 0
    const cgpaData = chronologicalSemesters.map((semester, index) => {
      semester.courses.forEach((course) => {
        const credits = getCredits(course)
        cumulativePoints += getPoints(course.grade, activeScheme) * credits
        cumulativeCredits += credits
      })

      return {
        name: semester.name,
        shortName: `S${index + 1}`,
        CGPA: cumulativeCredits > 0 ? Number((cumulativePoints / cumulativeCredits).toFixed(2)) : 0,
      }
    })
    const distribution = Object.keys(activeScheme.points).map((grade) => ({
      grade,
      count: semesters.reduce((count, semester) => count + semester.courses.filter((course) => course.grade === grade).length, 0),
    })).filter((item) => item.count > 0)
    const gradeCreditData = Object.keys(activeScheme.points).map((grade) => ({
      grade,
      credits: Number(semesters.reduce((total, semester) => (
        total + semester.courses
          .filter((course) => course.grade === grade)
          .reduce((sum, course) => sum + getCredits(course), 0)
      ), 0).toFixed(2)),
    })).filter((item) => item.credits > 0)
    const quality = semesterData.map((item) => ({
      subject: item.shortName,
      SGPA: item.SGPA,
      fullMark: 4,
    }))
    const best = semesterData.reduce((current, item) => (item.SGPA > current.SGPA ? item : current), { name: 'None', SGPA: 0 })
    const attention = semesterData.reduce((current, item) => (item.SGPA < current.SGPA ? item : current), semesterData[0] || { name: 'None', SGPA: 0 })
    const trend = semesterData.length > 1 ? Number((semesterData.at(-1).SGPA - semesterData.at(-2).SGPA).toFixed(2)) : 0
    const weightedCourses = semesters.flatMap((semester) => semester.courses.map((course) => ({
      name: course.name || 'Untitled course',
      shortName: (course.name || 'Course').replace(/^Lab:\s*/i, '').slice(0, 14),
      impact: Number((getCredits(course) * (activeScheme.max - getPoints(course.grade, activeScheme))).toFixed(2)),
      grade: course.grade,
      credits: getCredits(course),
    }))).sort((a, b) => b.impact - a.impact).slice(0, 6)
    const lowSemesters = semesterData.filter((item) => item.SGPA > 0 && item.SGPA < Math.min(2.5, activeScheme.max * 0.63))
    const recent = semesterData.at(-1) || { SGPA: 0, name: 'No semester' }
    const riskPoints = lowSemesters.length + (trend < -0.2 ? 1 : 0) + (recent.SGPA > 0 && recent.SGPA < activeScheme.max * 0.7 ? 1 : 0)
    const riskLevel = riskPoints >= 3 ? 'High' : riskPoints >= 1 ? 'Medium' : 'Low'
    const averageCredits = semesterData.length ? Number((totalCredits / semesterData.length).toFixed(1)) : 0

    return { cgpa, totalCredits, totalCourses, semesterData, cgpaData, distribution, gradeCreditData, quality, best, attention, trend, weightedCourses, lowSemesters, recent, riskLevel, averageCredits }
  }, [semesters, activeScheme])

  const featureInsights = useMemo(() => {
    const target = Number.parseFloat(targetCgpa)
    const credits = Number.parseFloat(plannedCredits)
    const currentPoints = stats.cgpa * stats.totalCredits
    const requiredSgpa = Number.isFinite(target) && Number.isFinite(credits) && credits > 0
      ? Number(((target * (stats.totalCredits + credits) - currentPoints) / credits).toFixed(2))
      : 0
    const boundedSgpa = Math.max(0, Math.min(activeScheme.max, requiredSgpa))
    const targetLabel = requiredSgpa > activeScheme.max ? `Above ${activeScheme.max.toFixed(2)}` : boundedSgpa.toFixed(2)
    const strategyCourse = stats.weightedCourses[0]
    const reportLines = [
      'GPA Tracker Academic Report',
      `CGPA: ${stats.cgpa.toFixed(2)} / ${activeScheme.max.toFixed(2)}`,
      `Credits completed: ${stats.totalCredits}`,
      `Courses tracked: ${stats.totalCourses}`,
      `Best semester: ${stats.best.name === 'None' ? 'Not available' : `${stats.best.name} (${stats.best.SGPA.toFixed(2)})`}`,
      `Focus semester: ${stats.attention.name === 'None' ? 'Not available' : `${stats.attention.name} (${stats.attention.SGPA.toFixed(2)})`}`,
      `Risk level: ${stats.riskLevel}`,
      `Grade scale: ${activeScheme.name}`,
    ]

    return {
      requiredSgpa,
      targetLabel,
      targetIsPossible: requiredSgpa <= activeScheme.max,
      strategyCourse,
      reportText: reportLines.join('\n'),
    }
  }, [activeScheme, plannedCredits, stats, targetCgpa])

  const displaySemesters = useMemo(
    () => [...semesters].sort((a, b) => Number(b.id) - Number(a.id)),
    [semesters],
  )

  const announce = (message) => {
    setStatusMessage(message)
    window.setTimeout(() => setStatusMessage(''), 2600)
  }

  const markUnsaved = () => {
    setHasUnsavedChanges(true)
  }

  const addSemester = () => {
    const nextSemester = {
      id: Date.now(),
      name: `Semester ${semesters.length + 1}`,
      courses: [],
    }
    setSemesters((current) => [...current, nextSemester])
    setExpandedSemesters(new Set())
    markUnsaved()
    announce('Semester added')
  }

  const updateSemesterName = (semesterId, name) => {
    setSemesters((current) => current.map((semester) => (semester.id === semesterId ? { ...semester, name } : semester)))
    markUnsaved()
  }

  const deleteSemester = (semesterId) => {
    setSemesters((current) => current.filter((semester) => semester.id !== semesterId))
    setExpandedSemesters((current) => {
      const next = new Set(current)
      next.delete(semesterId)
      return next
    })
    markUnsaved()
    announce('Semester removed')
  }

  const toggleSemester = (semesterId) => {
    setExpandedSemesters((current) => {
      if (current.has(semesterId)) return new Set()
      return new Set([semesterId])
    })
  }

  const addCourse = (semesterId) => {
    setSemesters((current) => current.map((semester) => (
      semester.id === semesterId
        ? {
            ...semester,
            courses: [
              ...semester.courses,
              { id: Date.now(), name: '', creditHours: 3, grade: 'B' },
            ],
          }
        : semester
    )))
    markUnsaved()
  }

  const updateCourse = (semesterId, courseId, field, value) => {
    setSemesters((current) => current.map((semester) => (
      semester.id === semesterId
        ? {
            ...semester,
            courses: semester.courses.map((course) => (course.id === courseId ? { ...course, [field]: value } : course)),
          }
        : semester
    )))
    markUnsaved()
  }

  const updateGradeScale = (schemeKey) => {
    setSelectedSchemeKey(schemeKey)
    markUnsaved()
    announce(`${getScheme(schemeKey).name} applied`)
  }

  const deleteCourse = (semesterId, courseId) => {
    setSemesters((current) => current.map((semester) => (
      semester.id === semesterId
        ? { ...semester, courses: semester.courses.filter((course) => course.id !== courseId) }
        : semester
    )))
    markUnsaved()
  }

  const importJson = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        setSemesters(normalizeSemesters(parsed))
        setExpandedSemesters(new Set())
        markUnsaved()
        announce(`${file.name} imported`)
      } catch {
        announce('Invalid JSON file')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(semesters, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = CURRENT_GRADES_FILE
    link.click()
    URL.revokeObjectURL(url)
    announce('JSON exported')
  }

  const saveToFirestore = async () => {
    if (!user || !firebaseReady || isSaving || !hasUnsavedChanges) return

    setIsSaving(true)
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'files', CURRENT_GRADES_FILE),
        {
          fileName: CURRENT_GRADES_FILE,
          semesters,
          gradeScale: selectedSchemeKey,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setLastSaved(new Date())
      setHasUnsavedChanges(false)
      setStatusMessage('Saved')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const dockItems = [
    { icon: <Plus size={18} />, label: 'Add semester', onClick: addSemester },
    {
      icon: <Save size={18} />,
      label: hasUnsavedChanges ? 'Save changes' : 'Saved',
      onClick: saveToFirestore,
      className: hasUnsavedChanges ? 'dock-item-ready' : 'dock-item-muted',
    },
    { icon: <Upload size={18} />, label: 'Import', onClick: () => fileInputRef.current?.click() },
    { icon: <Download size={18} />, label: 'Export JSON', onClick: exportJson },
    { icon: <LogOut size={18} />, label: 'Logout', onClick: () => signOut(auth) },
  ]

  if (authLoading) {
    return (
      <div className="loading-screen">
        <Loader2 className="spin" size={28} />
        <span>Opening GPA Tracker</span>
      </div>
    )
  }

  if (!user) {
    return <AuthScreen authError={authError} setAuthError={setAuthError} />
  }

  return (
    <main className="app-shell">
      <Motion.header className="minimal-header" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="brand-mark">
          <p>GPA-Track</p>
          <span className="user-tag">{userHandle}</span>
        </div>
        <button className="feature-search" type="button" onClick={() => setIsCommandOpen(true)}>
          <Search size={16} />
          <span>Search tools, plans, risks...</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="header-meta">
          <AnimatePresence>
            {statusMessage && (
              <Motion.div className="toast" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}>
                <Sparkles size={14} />
                {statusMessage}
              </Motion.div>
            )}
          </AnimatePresence>
          <span className="sync-pill">
            {isSaving ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
            {isSaving ? 'Saving' : hasUnsavedChanges ? 'Unsaved changes' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Firestore ready'}
          </span>
          {hasUnsavedChanges && (
            <button className="manual-save-button" type="button" onClick={saveToFirestore} disabled={isSaving}>
              <Save size={16} />
              Save
            </button>
          )}
        </div>
      </Motion.header>

      <FeatureCommandCenter
        activeFeature={activeFeature}
        activeScheme={activeScheme}
        featureInsights={featureInsights}
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onFeatureChange={setActiveFeature}
        onPlannedCreditsChange={setPlannedCredits}
        onSearchChange={setSearchQuery}
        onTargetCgpaChange={setTargetCgpa}
        onUpdateGradeScale={updateGradeScale}
        plannedCredits={plannedCredits}
        searchQuery={searchQuery}
        selectedSchemeKey={selectedSchemeKey}
        stats={stats}
        targetCgpa={targetCgpa}
      />

      <section className="hero-band">
        <Motion.div className="hero-copy" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <p className="eyebrow">CURRENT-GRADES.json / Firestore</p>
          <h1>{stats.cgpa.toFixed(2)}</h1>
          <span>Current CGPA across {stats.totalCredits} credit hours / {activeScheme.name}</span>
        </Motion.div>
        <div className="metric-grid">
          <Metric icon={BookOpen} label="Courses" value={stats.totalCourses} />
          <Metric icon={GraduationCap} label="Total Credits" value={stats.totalCredits} />
          <Metric icon={BarChart3} label="Semesters" value={semesters.length} />
          <Metric icon={Activity} label="Trend" value={`${stats.trend >= 0 ? '+' : ''}${stats.trend.toFixed(2)}`} />
        </div>
      </section>

      <input ref={fileInputRef} className="hidden-file-input" type="file" accept=".json,application/json" onChange={importJson} />

      {dataLoading ? (
        <div className="loading-card">
          <Loader2 className="spin" size={24} />
          Loading your Firestore grade file
        </div>
      ) : (
        <>
          <section className="dashboard-grid">
            <ChartCard
              title={isMomentumHovered ? 'CGPA trajectory' : 'SGPA momentum'}
              className="momentum-card"
              onMouseEnter={() => setIsMomentumHovered(true)}
              onMouseLeave={() => setIsMomentumHovered(false)}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={isMomentumHovered ? stats.cgpaData : stats.semesterData} margin={CHART_MARGIN}>
                  <defs>
                    <linearGradient id="sgpaFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={isMomentumHovered ? '#dc2626' : '#2563eb'} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={isMomentumHovered ? '#dc2626' : '#2563eb'} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="5 5" stroke="#dbe3ef" />
                  <XAxis dataKey="shortName" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 4]} tickLine={false} axisLine={false} />
                  <Tooltip content={<TrackerTooltip />} />
                  <Area
                    type="monotone"
                    dataKey={isMomentumHovered ? 'CGPA' : 'SGPA'}
                    stroke={isMomentumHovered ? '#dc2626' : '#2563eb'}
                    strokeWidth={3}
                    fill="url(#sgpaFill)"
                    animationDuration={260}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title={isGradeHovered ? 'Credits by grade' : 'Grade mix'}
              className="grade-card"
              onMouseEnter={() => setIsGradeHovered(true)}
              onMouseLeave={() => setIsGradeHovered(false)}
            >
              <ResponsiveContainer width="100%" height="100%">
                {isGradeHovered ? (
                  <BarChart data={stats.gradeCreditData} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="5 5" stroke="#dbe3ef" />
                    <XAxis dataKey="grade" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip content={<TrackerTooltip />} />
                    <Bar dataKey="credits" radius={[16, 16, 6, 6]} background={{ fill: 'rgba(148, 163, 184, 0.12)', radius: 16 }} animationDuration={260} maxBarSize={42}>
                      {stats.gradeCreditData.map((entry, index) => (
                        <Cell key={entry.grade} fill={GRADE_BAR_COLORS[index % GRADE_BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <Pie data={stats.distribution} dataKey="count" nameKey="grade" innerRadius={58} outerRadius={90} paddingAngle={4}>
                      {stats.distribution.map((entry, index) => (
                        <Cell key={entry.grade} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<TrackerTooltip />} />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Credit load" className="credit-card">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.semesterData} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="5 5" stroke="#dbe3ef" />
                  <XAxis dataKey="shortName" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip content={<TrackerTooltip />} />
                  <Bar dataKey="credits" fill="#8dd8c7" radius={[16, 16, 6, 6]} background={{ fill: 'rgba(141, 216, 199, 0.18)', radius: 16 }} animationDuration={260} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Semester balance" className="balance-card">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={stats.quality} margin={{ top: 10, right: 22, bottom: 10, left: 22 }}>
                  <PolarGrid stroke="#dbe3ef" />
                  <PolarAngleAxis dataKey="subject" />
                  <Radar dataKey="SGPA" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.22} />
                  <Tooltip content={<TrackerTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>

          <section className="insight-strip">
            <Insight label="Best semester" value={stats.best.name} detail={stats.best.name === 'None' ? 'No courses yet' : `${stats.best.SGPA.toFixed(2)} SGPA`} />
            <Insight label="Focus area" value={stats.attention.name} detail={stats.attention.name === 'None' ? 'No courses yet' : `${stats.attention.SGPA.toFixed(2)} SGPA`} />
            <Insight label="Grade spread" value={stats.distribution.length} detail="distinct grade bands" />
          </section>

          <section className="work-area">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Manual grade entry</p>
                <h2>Semesters</h2>
              </div>
              <span>{CURRENT_GRADES_FILE}</span>
            </div>

            <AnimatePresence mode="popLayout">
              {displaySemesters.map((semester) => (
                <Motion.article className="semester-card" key={semester.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="semester-header">
                    <button className="collapse-button" type="button" onClick={() => toggleSemester(semester.id)} aria-label="Toggle semester">
                      {expandedSemesters.has(semester.id) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    <input className="semester-name" value={semester.name} onChange={(event) => updateSemesterName(semester.id, event.target.value)} />
                    <span className="sgpa-chip">SGPA {calculateSGPA(semester, activeScheme).toFixed(2)}</span>
                    <span className="course-chip">{semester.courses.length} courses</span>
                    <span className="course-chip">{semester.courses.reduce((sum, course) => sum + getCredits(course), 0)} credits</span>
                    <button className="icon-action danger" type="button" onClick={() => deleteSemester(semester.id)} aria-label="Delete semester">
                      <Trash2 size={17} />
                    </button>
                  </div>

                  {expandedSemesters.has(semester.id) && (
                    <div className="courses">
                      {semester.courses.map((course) => (
                        <div className="course-row" key={course.id}>
                          <input value={course.name} placeholder="Course name" onChange={(event) => updateCourse(semester.id, course.id, 'name', event.target.value)} />
                          <input type="number" min="0" max="9" step="0.5" value={course.creditHours} onChange={(event) => updateCourse(semester.id, course.id, 'creditHours', event.target.value)} />
                          <select value={course.grade} onChange={(event) => updateCourse(semester.id, course.id, 'grade', event.target.value)}>
                            {Array.from(new Set([...Object.keys(activeScheme.points), course.grade])).map((grade) => (
                              <option key={grade} value={grade}>
                                {grade} / {activeScheme.ranges[grade] || 'custom'} / {activeScheme.points[grade] ?? 0}
                              </option>
                            ))}
                          </select>
                          <button className="icon-action danger" type="button" onClick={() => deleteCourse(semester.id, course.id)} aria-label="Delete course">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      <button className="add-course" type="button" onClick={() => addCourse(semester.id)}>
                        <Plus size={17} />
                        Add course
                      </button>
                      </div>
                  )}
                </Motion.article>
              ))}
            </AnimatePresence>
          </section>
        </>
      )}

      <Dock items={dockItems} panelHeight={64} baseItemSize={40} magnification={46} distance={100} dockHeight={92} />
    </main>
  )
}

const FEATURE_ITEMS = [
  { id: 'goals', title: 'Goal Planning', icon: Target, hint: 'Target CGPA and required SGPA' },
  { id: 'risk', title: 'Academic Risk Detection', icon: ShieldAlert, hint: 'Trend, low semesters, and focus level' },
  { id: 'strategy', title: 'Course Strategy', icon: Route, hint: 'Credit-weighted course impact' },
  { id: 'reports', title: 'Exportable Reports', icon: FileText, hint: 'Copy a clean academic summary' },
  { id: 'universities', title: 'Multi-University Support', icon: School, hint: 'Switch grading scale presets' },
]

function FeatureCommandCenter({
  activeFeature,
  activeScheme,
  featureInsights,
  isOpen,
  onClose,
  onFeatureChange,
  onPlannedCreditsChange,
  onSearchChange,
  onTargetCgpaChange,
  onUpdateGradeScale,
  plannedCredits,
  searchQuery,
  selectedSchemeKey,
  stats,
  targetCgpa,
}) {
  const filteredFeatures = FEATURE_ITEMS.filter((item) => (
    `${item.title} ${item.hint}`.toLowerCase().includes(searchQuery.toLowerCase())
  ))
  const currentFeature = FEATURE_ITEMS.find((item) => item.id === activeFeature) || FEATURE_ITEMS[0]
  const CurrentIcon = currentFeature.icon

  const copyReport = async () => {
    await navigator.clipboard.writeText(featureInsights.reportText)
  }

  const downloadReport = () => {
    const blob = new Blob([featureInsights.reportText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'gpa-tracker-report.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <Motion.div className="feature-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Motion.section
            className="feature-command"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="feature-command-top">
              <div className="feature-input-wrap">
                <Search size={17} />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Search Goal Planning, Risk, Strategy..."
                />
              </div>
              <button className="icon-action" type="button" onClick={onClose} aria-label="Close tools">
                <X size={17} />
              </button>
            </div>

            <div className="feature-layout">
              <nav className="feature-nav" aria-label="Academic tools">
                {filteredFeatures.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      className={activeFeature === item.id ? 'active' : ''}
                      key={item.id}
                      type="button"
                      onClick={() => onFeatureChange(item.id)}
                    >
                      <Icon size={18} />
                      <span>{item.title}</span>
                    </button>
                  )
                })}
              </nav>

              <div className="feature-panel">
                <div className="feature-panel-heading">
                  <CurrentIcon size={20} />
                  <div>
                    <h2>{currentFeature.title}</h2>
                    <p>{currentFeature.hint}</p>
                  </div>
                </div>

                {activeFeature === 'goals' && (
                  <div className="tool-grid">
                    <label className="tool-field">
                      Target CGPA
                      <input min="0" max={activeScheme.max} step="0.01" type="number" value={targetCgpa} onChange={(event) => onTargetCgpaChange(event.target.value)} />
                    </label>
                    <label className="tool-field">
                      Next credits
                      <input min="1" step="0.5" type="number" value={plannedCredits} onChange={(event) => onPlannedCreditsChange(event.target.value)} />
                    </label>
                    <div className="tool-result emphasis">
                      <span>Required next SGPA</span>
                      <strong>{featureInsights.targetLabel}</strong>
                      <p>{featureInsights.targetIsPossible ? 'Possible within the selected scale.' : 'Target needs more credits or multiple semesters.'}</p>
                    </div>
                  </div>
                )}

                {activeFeature === 'risk' && (
                  <div className="tool-grid">
                    <div className={`tool-result risk-${stats.riskLevel.toLowerCase()}`}>
                      <AlertTriangle size={18} />
                      <span>Risk level</span>
                      <strong>{stats.riskLevel}</strong>
                    </div>
                    <div className="tool-result">
                      <span>Recent momentum</span>
                      <strong>{stats.trend >= 0 ? '+' : ''}{stats.trend.toFixed(2)}</strong>
                      <p>Change from the previous semester.</p>
                    </div>
                    <div className="mini-list">
                      {stats.lowSemesters.length ? stats.lowSemesters.map((semester) => (
                        <span key={semester.name}>{semester.name} needs attention at {semester.SGPA.toFixed(2)}</span>
                      )) : <span>No low-performing semester detected.</span>}
                    </div>
                  </div>
                )}

                {activeFeature === 'strategy' && (
                  <div className="strategy-list">
                    {stats.weightedCourses.length ? stats.weightedCourses.map((course) => (
                      <div className="strategy-row" key={`${course.name}-${course.grade}`}>
                        <div>
                          <strong>{course.name}</strong>
                          <span>{course.credits} credits / {course.grade}</span>
                        </div>
                        <span className="impact-pill">{course.impact.toFixed(2)} upside</span>
                      </div>
                    )) : <div className="tool-result">Add courses to calculate course strategy.</div>}
                    {featureInsights.strategyCourse && (
                      <div className="tool-result emphasis">
                        <span>Best next move</span>
                        <strong>{featureInsights.strategyCourse.name}</strong>
                        <p>Higher credits and lower grade points make this the strongest improvement candidate.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeFeature === 'reports' && (
                  <div className="report-tool">
                    <pre>{featureInsights.reportText}</pre>
                    <div className="report-actions">
                      <button className="primary-action" type="button" onClick={copyReport}>
                        <FileText size={17} />
                        Copy report
                      </button>
                      <button className="soft-action" type="button" onClick={downloadReport}>
                        <Download size={17} />
                        Download .txt
                      </button>
                    </div>
                  </div>
                )}

                {activeFeature === 'universities' && (
                  <div className="scheme-grid">
                    {Object.entries(UNIVERSITY_SCHEMES).map(([schemeKey, scheme]) => (
                      <button
                        className={selectedSchemeKey === schemeKey ? 'scheme-card active' : 'scheme-card'}
                        key={schemeKey}
                        type="button"
                        onClick={() => onUpdateGradeScale(schemeKey)}
                      >
                        <span>{scheme.name}</span>
                        <strong>{scheme.max.toFixed(2)}</strong>
                        <small>{Object.keys(scheme.points).slice(0, 4).join(', ')}...</small>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Motion.section>
        </Motion.div>
      )}
    </AnimatePresence>
  )
}

function Metric({ icon, label, value }) {
  const IconComponent = icon
  return (
    <Motion.div className="metric-card" whileHover={{ y: -3 }}>
      <IconComponent size={19} />
      <span>{label}</span>
      <strong>{value}</strong>
    </Motion.div>
  )
}

function ChartCard({ title, children, className = '', onMouseEnter, onMouseLeave }) {
  return (
    <Motion.article className={`chart-card ${className}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <h3>{title}</h3>
      {children}
    </Motion.article>
  )
}

function Insight({ label, value, detail }) {
  return (
    <Motion.div className="insight-card" whileHover={{ scale: 1.01 }}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Motion.div>
  )
}

function TrackerTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div className="tracker-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.name}>
          {item.name}: {item.value}
        </span>
      ))}
    </div>
  )
}

export default App
