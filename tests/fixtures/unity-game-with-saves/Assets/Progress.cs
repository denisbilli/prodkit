using System.IO;
using UnityEngine;

public class Progress : MonoBehaviour
{
    // The level the player reached, kept across sessions.
    public void Store(int level)
    {
        PlayerPrefs.SetInt("level", level);
        PlayerPrefs.Save();
    }

    public int Restore()
    {
        return PlayerPrefs.GetInt("level", 1);
    }

    // The larger save, written where the platform says a game may keep files.
    public void Write(string json)
    {
        File.WriteAllText(Path.Combine(Application.persistentDataPath, "save.json"), json);
    }
}
