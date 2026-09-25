<?php

class AttachmentController
{
    public function save(): void
    {
        $file = $_FILES['attachment'];
        move_uploaded_file($file['tmp_name'], __DIR__ . '/../data/' . basename($file['name']));
    }
}
