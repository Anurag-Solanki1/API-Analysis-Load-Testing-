import com.codechecker.security.JwtService;
import com.codechecker.entity.UserEntity;
import org.springframework.test.util.ReflectionTestUtils;

public class TestJwt {
    public static void main(String[] args) throws Exception {
        // Can't easily spin up JwtService outside spring boot. Let's just grab the secret from application.properties
    }
}
