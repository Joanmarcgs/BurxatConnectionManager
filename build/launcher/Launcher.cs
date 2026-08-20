using System;
using System.Diagnostics;
using System.IO;
using System.Text;

// Tiny root-level launcher for the portable zip distribution. Keeping this at the zip root
// (with the real Electron app tucked into app/) means double-clicking it starts the real app
// instantly — no self-extraction step, unlike the old NSIS "portable" exe which had to unpack
// its ~70MB payload to a temp folder on every single launch (~10s vs ~0.6s).
internal static class Launcher
{
    private static int Main(string[] args)
    {
        string rootDir = AppDomain.CurrentDomain.BaseDirectory;
        string realExePath = Path.Combine(rootDir, "app", "BurxatConnectionManager.exe");

        if (!File.Exists(realExePath))
        {
            Console.Error.WriteLine("Could not find app\\BurxatConnectionManager.exe next to this launcher.");
            return 1;
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = realExePath,
            Arguments = JoinArgs(args),
            UseShellExecute = false,
            WorkingDirectory = rootDir
        };

        // Same mechanism the app already uses to keep its vault portable when launched via the
        // NSIS "portable" target — point it at this launcher's own directory (the zip root),
        // not the app/ subfolder, so connections.vault ends up next to this exe.
        startInfo.EnvironmentVariables["PORTABLE_EXECUTABLE_DIR"] = rootDir.TrimEnd('\\');

        Process.Start(startInfo);
        return 0;
    }

    private static string JoinArgs(string[] args)
    {
        var sb = new StringBuilder();
        foreach (string arg in args)
        {
            if (sb.Length > 0) sb.Append(' ');
            sb.Append('"').Append(arg.Replace("\"", "\\\"")).Append('"');
        }
        return sb.ToString();
    }
}
