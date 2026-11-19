/// XP por bloco de questões: cada questão vale 1, cada acerto mais 2.
pub fn for_questions(total: i32, correct: i32) -> i32 {
    total + correct * 2
}

#[cfg(test)]
mod tests {
    #[test]
    fn questions_xp() {
        assert_eq!(super::for_questions(30, 15), 60);
        assert_eq!(super::for_questions(10, 0), 10);
    }
}
