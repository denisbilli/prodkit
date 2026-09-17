using UnityEngine;
public class Player : MonoBehaviour {
    void Update() { transform.Translate(Vector3.forward * Time.deltaTime); }
}
