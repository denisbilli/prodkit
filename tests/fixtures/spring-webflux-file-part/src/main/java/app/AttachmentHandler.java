package app;

import org.springframework.http.codec.multipart.FilePart;
import reactor.core.publisher.Mono;

public class AttachmentHandler {
    public Mono<Void> upload(FilePart file) {
        return file.transferTo(java.nio.file.Path.of("attachments", file.filename()));
    }
}
