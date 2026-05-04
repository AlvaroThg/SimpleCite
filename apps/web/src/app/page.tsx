export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-blue-600 mb-4">
          SimpleCite
        </h1>
        <p className="text-xl text-gray-600 max-w-md mx-auto">
          Gestión de consultorios médicos para Bolivia.
          <br />
          Citas • Pagos QR • Registros Médicos
        </p>
        <div className="mt-8 p-4 bg-white rounded-lg shadow-md inline-block">
          <p className="text-sm text-gray-500">
            🚧 Panel administrativo en construcción — Fase 1
          </p>
        </div>
      </div>
    </main>
  );
}
